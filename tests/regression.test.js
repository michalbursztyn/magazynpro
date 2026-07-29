const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function createBrowserContext() {
  const storage = new Map();
  const context = {
    clearTimeout,
    console,
    Date,
    Intl,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    Set,
    String,
    URL,
    localStorage: {
      getItem: key => storage.has(String(key)) ? storage.get(String(key)) : null,
      setItem: (key, value) => storage.set(String(key), String(value)),
      removeItem: key => storage.delete(String(key))
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function loadScript(context, filename) {
  const source = fs.readFileSync(path.join(projectRoot, filename), 'utf8');
  vm.runInContext(source, context, { filename });
}

test('ścisłe parsery nie zamieniają błędnych wartości na poprawne dane biznesowe', () => {
  const context = createBrowserContext();
  loadScript(context, 'app-core.js');

  assert.equal(vm.runInContext('strictNonNegativeNumber(Infinity)', context), null);
  assert.equal(vm.runInContext('strictNonNegativeNumber("-1")', context), null);
  assert.equal(vm.runInContext('strictNonNegativeNumber("0x10")', context), null);
  assert.equal(vm.runInContext('strictNonNegativeNumber("1e3")', context), null);
  assert.equal(vm.runInContext('strictNonNegativeNumber("12,34")', context), 12.34);
  assert.equal(vm.runInContext('strictNonNegInt(-1)', context), null);
  assert.equal(vm.runInContext('strictPosInt(0)', context), null);
  assert.equal(vm.runInContext('safeInt(undefined)', context), 0);
});

test('sortowanie partii jest deterministyczne również dla identyfikatorów tekstowych', () => {
  const context = createBrowserContext();
  loadScript(context, 'app-core.js');

  const sortedIds = vm.runInContext(`
    [
      { id: "lot-10", dateIn: "2026-01-01" },
      { id: "lot-2", dateIn: "2026-01-01" },
      { id: "lot-1", dateIn: "2026-01-01" }
    ].sort(compareLotsForConsumption).map(row => row.id)
  `, context);

  assert.deepEqual(Array.from(sortedIds), ['lot-1', 'lot-2', 'lot-10']);
});

test('nieznany błąd backendu nie jest przekazywany użytkownikowi', () => {
  const context = createBrowserContext();
  context.supabase = {
    createClient: () => ({ auth: {} })
  };
  loadScript(context, 'app-supabase.js');

  const message = context.getUserFriendlyErrorMessage(
    new Error('select secret_token from internal_table'),
    'Bezpieczny komunikat'
  );
  assert.equal(message, 'Bezpieczny komunikat');

  const safeError = new Error('Popraw wartość pola.');
  safeError.userSafe = true;
  assert.equal(context.getUserFriendlyErrorMessage(safeError, 'Fallback'), 'Popraw wartość pola.');
});

test('logowanie przekazuje istniejące sześci znakowe hasło bez blokady klienta', async () => {
  const context = createBrowserContext();
  context.supabase = {
    createClient: () => ({
      auth: {
        signInWithPassword: async credentials => {
          context.receivedCredentials = credentials;
          return { data: { session: {} }, error: null };
        }
      }
    })
  };
  loadScript(context, 'app-supabase.js');

  await context.signInWithPassword('pracownik@firma.pl', '123456');

  assert.equal(context.receivedCredentials.email, 'pracownik@firma.pl');
  assert.equal(context.receivedCredentials.password, '123456');
});

test('company_id spoza aktywnego kontekstu jest odrzucany', () => {
  const context = createBrowserContext();
  context.supabase = {
    createClient: () => ({ auth: {} })
  };
  loadScript(context, 'app-supabase.js');
  context.appAuth.companyId = 'company-a';

  assert.equal(vm.runInContext('requireBusinessCompanyId("company-a")', context), 'company-a');
  assert.throws(
    () => vm.runInContext('requireBusinessCompanyId("company-b")', context),
    /spoza aktywnego kontekstu/
  );
});

test('zapis jest blokowany bez kompletnego, zsynchronizowanego snapshotu', () => {
  const context = createBrowserContext();
  context.supabase = {
    createClient: () => ({ auth: {} })
  };
  loadScript(context, 'app-supabase.js');

  context.__appDataSnapshotReady = false;
  assert.throws(
    () => vm.runInContext('requireBusinessWriteReady()', context),
    /nie są w pełni zsynchronizowane/
  );

  context.__appDataSnapshotReady = true;
  assert.doesNotThrow(() => vm.runInContext('requireBusinessWriteReady()', context));
});

test('pobieranie stron zwraca komplet danych zamiast pierwszego limitu', async () => {
  const context = createBrowserContext();
  context.supabase = {
    createClient: () => ({ auth: {} })
  };
  loadScript(context, 'app-supabase.js');

  context.__rows = Array.from({ length: 1201 }, (_, index) => ({ id: index + 1 }));
  const count = await vm.runInContext(`
    fetchAllSupabasePages(
      () => ({
        range: async (from, to) => ({
          data: __rows.slice(from, to + 1),
          error: null
        })
      })
    ).then(rows => rows.length)
  `, context);

  assert.equal(count, 1201);
});

test('chronione katalogi i ustawienia są zapisywane przez RPC, nie bezpośredni update', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'app-supabase.js'), 'utf8');

  for (const rpcName of [
    'save_company_thresholds',
    'create_catalog_supplier',
    'set_catalog_part_active',
    'set_catalog_supplier_active',
    'set_machine_definition_active'
  ]) {
    assert.match(source, new RegExp(`\\.rpc\\(['"]${rpcName}['"]`));
  }

  assert.doesNotMatch(source, /\.from\(['"]companies['"]\)\s*\.update/);
  assert.doesNotMatch(source, /\.from\(['"]parts['"]\)\s*\.update/);
  assert.doesNotMatch(source, /\.from\(['"]suppliers['"]\)\s*\.(?:insert|update)/);
  assert.doesNotMatch(source, /\.from\(['"]machine_definitions['"]\)\s*\.update/);
});

test('migracja backendu zawiera krytyczne zabezpieczenia integralności i dostępu', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'supabase', 'migrations', '20260729190000_backend_hardening.sql'),
    'utf8'
  );

  assert.match(source, /join public\.profiles pr[\s\S]+pr\.is_active = true/);
  assert.match(source, /join public\.companies c[\s\S]+c\.is_active = true/);
  assert.match(source, /drop policy if exists profiles_update_own/);
  assert.match(source, /Ręczna alokacja zawiera część spoza BOM/);
  assert.match(source, /pg_advisory_xact_lock/g);
  assert.match(source, /set search_path = ''/g);
  assert.match(source, /revoke all on function public\.provision_company_user[\s\S]+from public, anon, authenticated/);
  assert.match(source, /p\.id <> p_new_user_id/);
  assert.match(source, /on conflict \(id\) do update[\s\S]+email = excluded\.email/);
});

test('Edge Function nie ujawnia surowych błędów i sprawdza faktyczny rozmiar body', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'supabase', 'functions', 'create-company-worker', 'index.ts'),
    'utf8'
  );

  assert.match(source, /req\.arrayBuffer\(\)/);
  assert.match(source, /rawBody\.byteLength > MAX_BODY_BYTES/);
  assert.match(source, /\.eq\("id", callerUser\.id\)[\s\S]+callerProfile\.is_active !== true/);
  assert.match(source, /rpc\("provision_company_user"/);
  assert.doesNotMatch(source, /error instanceof Error\s*\?\s*error\.message/);
  assert.doesNotMatch(source, /(?:membershipError|provisionError|createUserError)\?*\.message/);
});
