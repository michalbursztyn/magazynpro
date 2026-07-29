// === SUPABASE BOOTSTRAP ===

window.APP_SUPABASE_CONFIG = {
  url: "https://vprzhxqgotxrmrjslzll.supabase.co",
  key: "sb_publishable_tQQWuI1oZN3VQ814S3eFOg_4Mi25nFD",
  createUserFunctionName: "create-company-worker",
  createWorkerFunctionName: "create-company-worker"
};

(function initSupabaseGlobal() {
  const cfg = window.APP_SUPABASE_CONFIG || {};
  const url = String(cfg.url || "").trim();
  const key = String(cfg.key || "").trim();

  if (!url || !key) {
    console.warn("Brak konfiguracji Supabase.");
    window.sb = null;
    window.appAuth = {
      client: null,
      session: null,
      user: null,
      profile: null,
      membership: null,
      companyId: null,
      companyName: null,
      companyLowWarn: null,
      companyLowDanger: null,
      companyUpdatedAt: null,
       companyRole: null,
       rolePermissions: {},
       companyLoaded: false,
       rolePermissionsLoaded: false
    };
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Biblioteka Supabase nie została załadowana.");
    window.sb = null;
    return;
  }

  const client = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  window.sb = client;
  window.appAuth = {
    client,
    session: null,
    user: null,
    profile: null,
    membership: null,
    companyId: null,
    companyName: null,
    companyLowWarn: null,
    companyLowDanger: null,
    companyUpdatedAt: null,
     companyRole: null,
     rolePermissions: {},
     companyLoaded: false,
     rolePermissionsLoaded: false
  };
})();

window.__authRefreshInFlight = null;

function reportSafeSupabaseError(context, error) {
  if (typeof window.logSafeError === 'function') {
    window.logSafeError(context, error);
  } else {
    console.error(String(context || 'Błąd Supabase'));
  }
}

function getRawErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err.trim();
  if (typeof err?.message === 'string') return err.message.trim();
  return '';
}

window.getUserFriendlyErrorMessage = function getUserFriendlyErrorMessage(err, fallbackMessage = 'Operacja nie powiodła się. Spróbuj ponownie.') {
  const rawMessage = getRawErrorMessage(err);
  const fallback = String(fallbackMessage || 'Operacja nie powiodła się. Spróbuj ponownie.').trim();
  const message = rawMessage.toLowerCase();

  if (!rawMessage) return fallback;
  if (err?.userSafe === true) return rawMessage;

  if (message.includes('invalid login credentials')) {
    return 'Nieprawidłowy e-mail lub hasło.';
  }

  if (message.includes('company_id')) {
    return 'Nie udało się ustalić danych firmy. Odśwież aplikację i zaloguj się ponownie.';
  }

  if (message.includes('supplier_id') || message.includes('part_id') || message.includes('mapowania supplier_id') || message.includes('mapowania part_id')) {
    return 'Wybrana część lub dostawca nie są już dostępne. Odśwież dane i spróbuj ponownie.';
  }

  if (message.includes('machinecode') || (message.includes('qty > 0') && message.includes('pozycja produkcji')) || (message.includes('machine_code') && message.includes('qty'))) {
    return 'Każda pozycja produkcji musi mieć wybraną maszynę i ilość większą od zera.';
  }

  if (message.includes('ręczna alokacja') && message.includes('qty > 0')) {
    return 'Każda ręczna alokacja musi wskazywać partię, część i ilość większą od zera.';
  }

  if (message.includes('edge function') || message.includes('http 500') || message.includes('fetch failed') || message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network error')) {
    return 'Operacja nie powiodła się po stronie serwera. Spróbuj ponownie za chwilę.';
  }

  if (message.includes('nie znaleziono dostawcy') || message.includes('brak dostawcy dla dostawy')) {
    return 'Wybrany dostawca nie jest już dostępny. Odśwież dane i wybierz go ponownie.';
  }

  if (message.includes('nie znaleziono części') || message.includes('brak pozycji dostawy do zapisania')) {
    return 'Jedna z wybranych części nie jest już dostępna. Odśwież dane i sprawdź pozycje.';
  }

  if (
    message.includes('nie udało się potwierdzić aktualnej wersji rekordu')
    || message.includes('został zmieniony przez innego użytkownika')
    || message.includes('została zmieniona przez innego użytkownika')
    || message.includes('ustawienia firmy zostały zmienione')
  ) {
    return 'Dane zostały zmienione przez innego użytkownika. Odśwież widok i spróbuj ponownie.';
  }

  if (message.includes('brak uprawnienia') || message.includes('tylko aktywny owner')) {
    return 'Nie masz uprawnienia do wykonania tej operacji.';
  }

  if (message.includes('brak klienta supabase')) {
    return 'Połączenie z serwerem nie jest gotowe. Odśwież aplikację i spróbuj ponownie.';
  }

  if (message.includes('brak aktywnej sesji')) {
    return 'Sesja wygasła. Zaloguj się ponownie.';
  }

  if (message.includes('brak konfiguracji supabase') || message.includes('brak nazwy edge function')) {
    return 'Aplikacja nie jest jeszcze poprawnie skonfigurowana. Skontaktuj się z administratorem.';
  }

  if (message.includes('membershipu')) {
    return 'Nie udało się ustalić użytkownika do aktualizacji. Odśwież listę i spróbuj ponownie.';
  }

  return fallback;
};

window.refreshAuthContext = async function refreshAuthContext(sessionOverride) {
  if (window.__authRefreshInFlight) return window.__authRefreshInFlight;

  window.__authRefreshInFlight = (async () => {
    if (!window.sb) {
      return {
        ok: false,
        reason: "missing_client"
      };
    }

    let session = (typeof sessionOverride !== "undefined") ? (sessionOverride || null) : null;

    if (typeof sessionOverride === "undefined") {
      const { data: sessionData, error: sessionError } = await window.sb.auth.getSession();
      if (sessionError) {
        reportSafeSupabaseError("Błąd getSession.", sessionError);
        return {
          ok: false,
          reason: "session_error",
          error: sessionError
        };
      }
      session = sessionData?.session || null;
    }

    const user = session?.user || null;

    window.appAuth.session = session;
    window.appAuth.user = user;
    window.appAuth.profile = null;
    window.appAuth.membership = null;
    window.appAuth.companyId = null;
    window.appAuth.companyName = null;
    window.appAuth.companyLowWarn = null;
    window.appAuth.companyLowDanger = null;
    window.appAuth.companyUpdatedAt = null;
    window.appAuth.companyRole = null;
    window.appAuth.rolePermissions = {};
    window.appAuth.companyLoaded = false;
    window.appAuth.rolePermissionsLoaded = false;

    if (!user) {
      return {
        ok: true,
        loggedIn: false,
        rolePermissions: {}
      };
    }

    const { data: profile, error: profileError } = await window.sb
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      reportSafeSupabaseError("Błąd pobierania profilu.", profileError);
      return {
        ok: false,
        reason: "profile_error",
        error: profileError
      };
    }
    if (!profile?.id || profile?.is_active !== true) {
      return {
        ok: false,
        reason: "inactive_or_missing_profile"
      };
    }

    const { data: membershipRows, error: membershipError } = await window.sb
      .from("company_members")
      .select("id, user_id, role, company_id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("company_id", { ascending: true })
      .limit(2);

    if (membershipError) {
      reportSafeSupabaseError("Błąd pobierania company_members.", membershipError);
      return {
        ok: false,
        reason: "membership_error",
        error: membershipError
      };
    }

    const activeMemberships = Array.isArray(membershipRows) ? membershipRows : [];
    if (activeMemberships.length > 1) {
      console.error("Niejednoznaczne aktywne członkostwo użytkownika.");
      return {
        ok: false,
        reason: "ambiguous_membership"
      };
    }
    const membership = activeMemberships[0] || null;
    const membershipRole = String(membership?.role || '').trim().toLowerCase();
    if (membership && (!membership?.id || !membership?.company_id || !['owner', 'admin', 'worker'].includes(membershipRole))) {
      return {
        ok: false,
        reason: "invalid_membership"
      };
    }

    let company = null;
    if (membership?.company_id) {
      const { data: companyData, error: companyError } = await window.sb
        .from("companies")
        .select("id, name, low_warn, low_danger, updated_at")
        .eq("id", membership.company_id)
        .maybeSingle();

      if (companyError) {
        reportSafeSupabaseError("Błąd pobierania companies.", companyError);
        return {
          ok: false,
          reason: "company_error",
          error: companyError
        };
      }
      company = companyData || null;
      if (!company?.id) {
        return {
          ok: false,
          reason: "company_not_found"
        };
      }
    }

    let rolePermissions = {};

    if (membership?.company_id) {
      window.appAuth.companyId = membership.company_id;
      try {
        const rows = await window.fetchCompanyRolePermissions?.(membership.company_id);
        rolePermissions = Array.isArray(rows)
          ? rows.reduce((acc, row) => {
              const role = String(row?.role || "").trim().toLowerCase();
              if (!role) return acc;
              acc[role] = {
                ...row,
                role
              };
              return acc;
            }, {})
          : {};
      } catch (err) {
        reportSafeSupabaseError("Błąd pobierania konfiguracji ról.", err);
        window.appAuth.companyId = null;
        return {
          ok: false,
          reason: "role_permissions_error",
          error: err
        };
      }
    }

    window.appAuth.profile = profile || null;
    window.appAuth.membership = membership || null;
    const companyName = String(company?.name || '').trim();
    const parseCompanyThreshold = (value, fallback) => {
      if (value == null) return fallback;
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 ? number : null;
    };
    const companyLowWarn = parseCompanyThreshold(company?.low_warn, 100);
    const companyLowDanger = parseCompanyThreshold(company?.low_danger, 50);
    const companyUpdatedAt = String(company?.updated_at || '').trim();
    if (company && (!companyName || !companyUpdatedAt || companyLowWarn === null || companyLowDanger === null || companyLowDanger > companyLowWarn)) {
      window.appAuth.companyId = null;
      return {
        ok: false,
        reason: "invalid_company_configuration"
      };
    }

    window.appAuth.companyId = membership?.company_id || null;
    window.appAuth.companyName = companyName || null;
    window.appAuth.companyLowWarn = company ? companyLowWarn : null;
    window.appAuth.companyLowDanger = company ? companyLowDanger : null;
    window.appAuth.companyUpdatedAt = company ? companyUpdatedAt : null;
    window.appAuth.companyRole = membershipRole || null;
    window.appAuth.rolePermissions = rolePermissions;
    window.appAuth.companyLoaded = !!company?.id && !!companyName;
    window.appAuth.rolePermissionsLoaded = !!membership?.company_id;

    return {
      ok: true,
      loggedIn: true,
      user,
      profile,
      membership,
      company,
      rolePermissions,
      rolePermissionsLoaded: !!membership?.company_id,
      rolePermissionsError: null
    };
  })();

  try {
    return await window.__authRefreshInFlight;
  } finally {
    window.__authRefreshInFlight = null;
  }
};

window.signInWithPassword = async function signInWithPassword(email, password) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const { data, error } = await window.sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  return data;
};

window.signOutApp = async function signOutApp() {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const { error } = await window.sb.auth.signOut();
  if (error) throw error;
};

window.updateOwnPassword = async function updateOwnPassword(newPassword) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const password = String(newPassword || "");
  if (!password) throw new Error("Nowe hasło nie może być puste.");
  if (password.length < 6) throw new Error("Nowe hasło musi mieć co najmniej 6 znaków.");

  const { data, error } = await window.sb.auth.updateUser({
    password
  });

  if (error) throw error;
  return data;
};

window.fetchCompanyRolePermissions = async function fetchCompanyRolePermissions(companyIdOverride) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const companyId = requireBusinessCompanyId(companyIdOverride);

  return fetchAllSupabasePages(() => window.sb
    .from("company_role_permissions")
    .select("id, company_id, role, tab_permissions, feature_permissions, created_at, updated_at")
    .eq("company_id", companyId)
    .order("role", { ascending: true })
    .order("id", { ascending: true }));
};

window.upsertCompanyRolePermissions = async function upsertCompanyRolePermissions(role, tabPermissions = {}, featurePermissions = {}, companyIdOverride) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");
  requireBusinessWriteReady();

  const companyId = requireBusinessCompanyId(companyIdOverride);
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (!["admin", "worker"].includes(normalizedRole)) {
    throw new Error("Na tym etapie można zapisywać konfigurację tylko dla ról admin i worker.");
  }

  const payload = {
    company_id: companyId,
    role: normalizedRole,
    tab_permissions: { ...(tabPermissions || {}) },
    feature_permissions: { ...(featurePermissions || {}) }
  };

  const { data, error } = await window.sb
    .from("company_role_permissions")
    .upsert(payload, { onConflict: "company_id,role" })
    .select("id, company_id, role, tab_permissions, feature_permissions, created_at, updated_at")
    .maybeSingle();

  if (error) throw error;
  return data;
};

window.fetchCompanyUsers = async function fetchCompanyUsers(companyIdOverride) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const companyId = requireBusinessCompanyId(companyIdOverride);

  const members = await fetchAllSupabasePages(() => window.sb
    .from("company_members")
    .select("id, user_id, role, company_id, is_active")
    .eq("company_id", companyId)
    .order("role", { ascending: true })
    .order("id", { ascending: true }));

  const userIds = [...new Set((members || []).map(m => m?.user_id).filter(Boolean))];
  let profilesById = new Map();

  if (userIds.length) {
    const profiles = [];
    for (const idChunk of splitIntoChunks(userIds)) {
      const chunkRows = await fetchAllSupabasePages(() => window.sb
        .from("profiles")
        .select("id, email, full_name, is_active")
        .in("id", idChunk)
        .order("id", { ascending: true }));
      profiles.push(...chunkRows);
    }
    profilesById = new Map(profiles.map(p => [p.id, p]));
  }

  return (members || []).map(member => {
    const profile = profilesById.get(member.user_id) || null;
    return {
      id: member.id,
      user_id: member.user_id,
      company_id: member.company_id,
      role: member.role,
      is_active: !!member.is_active,
      email: profile?.email || "—",
      full_name: profile?.full_name || "",
      profile_is_active: profile?.is_active !== false
    };
  }).sort((a, b) => {
    if (a.role === 'owner' && b.role !== 'owner') return -1;
    if (a.role !== 'owner' && b.role === 'owner') return 1;
    return String(a.email || '').localeCompare(String(b.email || ''), 'pl');
  });
};

window.updateCompanyMember = async function updateCompanyMember(memberId, updates = {}) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");
  requireBusinessWriteReady();

  const normalizedMemberId = String(memberId || "").trim();
  if (!normalizedMemberId) throw new Error("Brak id membershipu.");

  const normalizedRole = typeof updates.role === "string"
    ? String(updates.role).trim().toLowerCase()
    : null;
  const nextActive = typeof updates.is_active === "boolean"
    ? updates.is_active
    : null;

  if (normalizedRole !== null && !["admin", "worker"].includes(normalizedRole)) {
    throw new Error("Można ustawić wyłącznie rolę admin albo worker.");
  }
  if (normalizedRole === null && nextActive === null) {
    throw new Error("Brak zmian do zapisania.");
  }

  const { data, error } = await window.sb.rpc("update_company_member", {
    p_member_id: normalizedMemberId,
    p_role: normalizedRole,
    p_is_active: nextActive
  });

  if (error) throw error;
  const member = data?.membership || data || null;
  if (!member?.id) throw new Error("Nie udało się zaktualizować użytkownika.");
  return member;
};

window.createCompanyUser = async function createCompanyUser(payload = {}) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");
  requireBusinessWriteReady();

  const fullName = String(payload?.fullName || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  const role = String(payload?.role || "worker").trim().toLowerCase() || "worker";
  const companyId = window.appAuth?.companyId || null;

  if (!companyId) throw new Error("Brak company_id w kontekście użytkownika.");
  if (!fullName) throw new Error("Podaj imię i nazwisko pracownika.");
  if (fullName.length > 150) throw new Error("Imię i nazwisko nie może przekraczać 150 znaków.");
  if (!email) throw new Error("Podaj adres e-mail pracownika.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Podaj poprawny adres e-mail pracownika.");
  if (!password) throw new Error("Podaj hasło startowe.");
  if (password.length < 6) throw new Error("Hasło startowe musi mieć co najmniej 6 znaków.");
  if (!["worker", "admin"].includes(role)) throw new Error("Na tym etapie można tworzyć tylko konta worker albo admin.");

  const functionName = String(
    window.APP_SUPABASE_CONFIG?.createUserFunctionName
    || window.APP_SUPABASE_CONFIG?.createWorkerFunctionName
    || ""
  ).trim();
  if (!functionName) {
    throw new Error("Brak nazwy Edge Function dla ręcznego tworzenia użytkownika. Skonfiguruj createUserFunctionName.");
  }

  const { data: sessionData, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error("Brak aktywnej sesji użytkownika. Zaloguj się ponownie.");
  }

  const supabaseUrl = String(window.APP_SUPABASE_CONFIG?.url || "").trim().replace(/\/$/, "");
  const supabaseKey = String(window.APP_SUPABASE_CONFIG?.key || "").trim();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brak konfiguracji Supabase URL lub key.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      fullName,
      email,
      password,
      companyId,
      role
    })
  });

  let result = null;
  try {
    result = await response.json();
  } catch {}

  if (!response.ok) {
    const edgeErrorMessages = {
      invalid_session: 'Sesja wygasła. Zaloguj się ponownie.',
      inactive_profile: 'To konto jest nieaktywne.',
      forbidden: 'Nie masz uprawnienia do tworzenia użytkowników.',
      company_mismatch: 'Nie można utworzyć użytkownika w innej firmie.',
      inactive_company: 'Firma jest nieaktywna.',
      email_already_exists: 'Użytkownik z takim adresem e-mail już istnieje.',
      invalid_full_name: 'Podaj poprawne imię i nazwisko.',
      invalid_email: 'Podaj poprawny adres e-mail.',
      invalid_password: 'Hasło musi mieć od 6 do 128 znaków.',
      invalid_role: 'Wybierz rolę admin albo worker.',
      payload_too_large: 'Przesłane dane są zbyt duże.',
      missing_env: 'Funkcja tworzenia użytkowników nie jest poprawnie skonfigurowana.',
      authorization_check_failed: 'Nie udało się potwierdzić uprawnień użytkownika.',
      existing_user_lookup_failed: 'Nie udało się sprawdzić istniejącego użytkownika.',
      create_user_failed: 'Nie udało się utworzyć konta logowania.',
      provisioning_failed: 'Konto logowania utworzono, ale nie udało się przypisać go do firmy. Operacja została wycofana.',
      provisioning_and_cleanup_failed: 'Operacja nie została dokończona. Administrator musi sprawdzić konto testowe.',
      internal_error: 'Funkcja tworzenia użytkowników zakończyła się nieoczekiwanym błędem.'
    };
    const safeMessage = edgeErrorMessages[String(result?.error || '')]
      || `Nie udało się utworzyć użytkownika (HTTP ${response.status}).`;
    const err = new Error(safeMessage);
    err.status = response.status;
    err.code = String(result?.error || 'edge_function_error');
    err.userSafe = true;
    throw err;
  }

  return result || null;
};

window.createCompanyWorker = async function createCompanyWorker(payload = {}) {
  return window.createCompanyUser(payload);
};

function requireBusinessCompanyId(companyIdOverride) {
  const companyId = String(window.appAuth?.companyId || '').trim();
  const requestedCompanyId = String(companyIdOverride || '').trim();
  if (!window.sb) throw new Error("Brak klienta Supabase.");
  if (!companyId) throw new Error("Brak company_id w kontekście użytkownika.");
  if (requestedCompanyId && requestedCompanyId !== companyId) {
    throw new Error("Próba użycia company_id spoza aktywnego kontekstu użytkownika.");
  }
  return companyId;
}

function requireBusinessWriteReady() {
  if (window.__appDataSnapshotReady !== true) {
    const error = new Error("Dane aplikacji nie są w pełni zsynchronizowane. Odśwież stronę przed wykonaniem zapisu.");
    error.userSafe = true;
    throw error;
  }
}

function requireNonNegativeNumber(value, label) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (typeof normalized === 'string' && !/^\d+(?:\.\d+)?$/.test(normalized)) {
    const error = new Error(`${label} musi być skończoną liczbą większą lub równą 0.`);
    error.userSafe = true;
    throw error;
  }
  const number = normalized === '' ? NaN : Number(normalized);
  if (!Number.isFinite(number) || number < 0 || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    const error = new Error(`${label} musi być skończoną liczbą większą lub równą 0.`);
    error.userSafe = true;
    throw error;
  }
  return number;
}

function requireNonNegativeInt(value, label) {
  const number = requireNonNegativeNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    const error = new Error(`${label} musi być liczbą całkowitą większą lub równą 0.`);
    error.userSafe = true;
    throw error;
  }
  return number;
}

function requirePositiveInt(value, label) {
  const number = requireNonNegativeInt(value, label);
  if (number < 1) {
    const error = new Error(`${label} musi być liczbą całkowitą większą od 0.`);
    error.userSafe = true;
    throw error;
  }
  return number;
}

function requireISODate(value, label) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const error = new Error(`${label} ma nieprawidłowy format.`);
    error.userSafe = true;
    throw error;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    const error = new Error(`${label} jest nieprawidłowa.`);
    error.userSafe = true;
    throw error;
  }
  return raw;
}

const SUPABASE_FETCH_PAGE_SIZE = 500;
const SUPABASE_FETCH_MAX_PAGES = 10000;

async function fetchAllSupabasePages(createQuery, options = {}) {
  const pageSize = Math.max(1, Number(options?.pageSize) || SUPABASE_FETCH_PAGE_SIZE);
  const rows = [];

  for (let page = 0; page < SUPABASE_FETCH_MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const query = createQuery();
    if (!query || typeof query.range !== 'function') {
      throw new Error('Klient Supabase nie obsługuje wymaganego stronicowania danych.');
    }

    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }

  throw new Error('Przekroczono bezpieczny limit stron podczas pobierania danych.');
}

function splitIntoChunks(values, chunkSize = 100) {
  const rows = Array.isArray(values) ? values : [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}


function getCatalogConflictErrorMessage(recordLabel) {
  return `Ten ${recordLabel} został zmieniony przez innego użytkownika. Odśwież dane i spróbuj ponownie.`;
}

function ensureExpectedUpdatedAt(expectedUpdatedAt, recordLabel) {
  const normalized = String(expectedUpdatedAt || '').trim();
  if (!normalized) {
    throw new Error(`Nie udało się potwierdzić aktualnej wersji rekordu (${recordLabel}). Odśwież dane i spróbuj ponownie.`);
  }
  return normalized;
}


function normalizeNullableExpectedUpdatedAt(expectedUpdatedAt) {
  const normalized = String(expectedUpdatedAt || '').trim();
  return normalized || null;
}

function getSupplierIdByNameFromCatalogRows(rows, supplierName) {
  const normalizedName = String(supplierName || '').trim();
  if (!normalizedName) {
    throw new Error('Brakuje nazwy dostawcy do mapowania supplier_id.');
  }

  const row = (Array.isArray(rows) ? rows : []).find(item => String(item?.name || '').trim() === normalizedName);
  if (!row?.id) {
    throw new Error('Wybrany dostawca nie jest już dostępny. Odśwież dane i spróbuj ponownie.');
  }

  return row.id;
}

function getPartIdBySkuFromCatalogRows(rows, sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) {
    throw new Error('Brakuje sku części do mapowania part_id.');
  }

  const row = (Array.isArray(rows) ? rows : []).find(item => String(item?.sku || '').trim().toLowerCase() === normalizedSku.toLowerCase());
  if (!row?.id) {
    throw new Error('Wybrana część nie jest już dostępna. Odśwież dane i spróbuj ponownie.');
  }

  return row.id;
}

window.fetchCatalogParts = async function fetchCatalogParts(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from("parts")
    .select("id, company_id, sku, name, is_active, warning_qty, critical_qty, updated_at")
    .eq("company_id", companyId)
    .order("sku", { ascending: true })
    .order("id", { ascending: true }));
};

window.fetchCatalogSuppliers = async function fetchCatalogSuppliers(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from("suppliers")
    .select("id, company_id, name, is_active, updated_at")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .order("id", { ascending: true }));
};

window.fetchSupplierPartPrices = async function fetchSupplierPartPrices(supplierIds = []) {
  requireBusinessCompanyId();
  const ids = [...new Set((Array.isArray(supplierIds) ? supplierIds : []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = [];
  for (const idChunk of splitIntoChunks(ids)) {
    const chunkRows = await fetchAllSupabasePages(() => window.sb
      .from("supplier_part_prices")
      .select("id, supplier_id, part_id, price")
      .in("supplier_id", idChunk)
      .order("id", { ascending: true }));
    rows.push(...chunkRows);
  }
  return rows;
};

window.fetchMachineDefinitions = async function fetchMachineDefinitions(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from("machine_definitions")
    .select("id, company_id, code, name, is_active, updated_at")
    .eq("company_id", companyId)
    .order("code", { ascending: true })
    .order("id", { ascending: true }));
};

window.fetchMachineBomItems = async function fetchMachineBomItems(machineDefinitionIds = []) {
  requireBusinessCompanyId();
  const ids = [...new Set((Array.isArray(machineDefinitionIds) ? machineDefinitionIds : []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = [];
  for (const idChunk of splitIntoChunks(ids)) {
    const chunkRows = await fetchAllSupabasePages(() => window.sb
      .from("machine_bom_items")
      .select("id, machine_definition_id, part_id, qty")
      .in("machine_definition_id", idChunk)
      .order("id", { ascending: true }));
    rows.push(...chunkRows);
  }
  return rows;
};

window.fetchCatalogStateFromSupabase = async function fetchCatalogStateFromSupabase(companyIdOverride) {
  const [partsRows, suppliersRows, machineRows] = await Promise.all([
    window.fetchCatalogParts(companyIdOverride),
    window.fetchCatalogSuppliers(companyIdOverride),
    window.fetchMachineDefinitions(companyIdOverride)
  ]);
  const [priceRows, bomRows] = await Promise.all([
    window.fetchSupplierPartPrices((suppliersRows || []).map(row => row?.id).filter(Boolean)),
    window.fetchMachineBomItems((machineRows || []).map(row => row?.id).filter(Boolean))
  ]);

  const partsById = new Map();
  const partsCatalog = new Map();
  (partsRows || []).forEach(row => {
    const sku = String(row?.sku || '').trim();
    const key = sku.toLowerCase();
    const name = String(row?.name || '').trim();
    if (!row?.id || !sku || !name) return;
    partsById.set(row.id, row);
    partsCatalog.set(key, {
      sku,
      name,
      yellowThreshold: Number.isInteger(row?.warning_qty) ? row.warning_qty : (row?.warning_qty == null ? null : Math.max(0, Math.trunc(Number(row.warning_qty) || 0))),
      redThreshold: Number.isInteger(row?.critical_qty) ? row.critical_qty : (row?.critical_qty == null ? null : Math.max(0, Math.trunc(Number(row.critical_qty) || 0))),
      archived: row?.is_active === false,
      _rowId: row?.id ?? null,
      _updatedAt: String(row?.updated_at || '').trim() || null
    });
  });

  const suppliersById = new Map();
  const suppliers = new Map();
  (suppliersRows || []).forEach(row => {
    const name = String(row?.name || '').trim();
    if (!row?.id || !name) return;
    suppliersById.set(row.id, row);
    suppliers.set(name, {
      archived: row?.is_active === false,
      prices: new Map(),
      _rowId: row?.id ?? null,
      _updatedAt: String(row?.updated_at || '').trim() || null
    });
  });

  (priceRows || []).forEach(row => {
    const supplier = suppliersById.get(row?.supplier_id);
    const part = partsById.get(row?.part_id);
    if (!supplier || !part) return;
    const supplierEntry = suppliers.get(String(supplier.name || '').trim());
    const partKey = String(part.sku || '').trim().toLowerCase();
    if (!supplierEntry || !partKey) return;
    supplierEntry.prices.set(partKey, requireNonNegativeNumber(row?.price, 'Cena w cenniku dostawcy'));
  });

  const machineRowsById = new Map();
  const bomByMachineId = new Map();

  (machineRows || []).forEach(row => {
    if (!row?.id) return;
    machineRowsById.set(row.id, row);
    bomByMachineId.set(row.id, []);
  });

  (bomRows || []).forEach(row => {
    const machineId = row?.machine_definition_id;
    const part = partsById.get(row?.part_id);
    if (!machineId || !part || !bomByMachineId.has(machineId)) return;
    bomByMachineId.get(machineId).push({
      sku: String(part.sku || '').trim(),
      qty: requirePositiveInt(row?.qty, 'Ilość części w BOM')
    });
  });

  const machineCatalog = (machineRows || []).map(row => ({
    code: String(row?.code || '').trim(),
    name: String(row?.name || '').trim(),
    archived: row?.is_active === false,
    _rowId: row?.id ?? null,
    _updatedAt: String(row?.updated_at || '').trim() || null,
    bom: Array.isArray(bomByMachineId.get(row.id)) ? bomByMachineId.get(row.id) : []
  })).filter(row => row.code && row.name);

  return {
    partsCatalog,
    suppliers,
    machineCatalog
  };
};

window.saveCatalogPartToSupabase = async function saveCatalogPartToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(payload?.companyId);
  const sku = String(payload?.sku || '').trim();
  const name = String(payload?.name || '').trim();
  const originalSku = String(payload?.originalSku || sku).trim();
  const selectedSuppliers = Array.isArray(payload?.selectedSuppliers)
    ? [...new Set(payload.selectedSuppliers.map(x => String(x || '').trim()).filter(Boolean))]
    : [];
  const pricesBySupplier = payload?.pricesBySupplier && typeof payload.pricesBySupplier === 'object'
    ? payload.pricesBySupplier
    : {};
  const archived = payload?.archived === true;
  const expectedUpdatedAt = normalizeNullableExpectedUpdatedAt(payload?.expectedUpdatedAt);

  if (!sku || !name) throw new Error('Część musi mieć poprawny identyfikator i nazwę.');
  if (!/^[a-zA-Z0-9_-]+$/.test(sku) || sku.length > 50 || name.length > 200) {
    const error = new Error('Identyfikator lub nazwa części mają nieprawidłowy format.');
    error.userSafe = true;
    throw error;
  }

  const warningQty = payload?.yellowThreshold == null
    ? null
    : requireNonNegativeInt(payload.yellowThreshold, 'Próg żółty');
  const criticalQty = payload?.redThreshold == null
    ? null
    : requireNonNegativeInt(payload.redThreshold, 'Próg czerwony');
  if ((warningQty === null) !== (criticalQty === null) || (warningQty !== null && criticalQty > warningQty)) {
    const error = new Error('Uzupełnij oba progi, a próg czerwony ustaw nie wyżej niż żółty.');
    error.userSafe = true;
    throw error;
  }

  const supplierRows = await window.fetchCatalogSuppliers(companyId);
  const pSupplierPrices = selectedSuppliers.map(supplierName => ({
    supplier_id: getSupplierIdByNameFromCatalogRows(supplierRows, supplierName),
    price: requireNonNegativeNumber(pricesBySupplier[supplierName], `Cena dla dostawcy ${supplierName}`)
  }));

  const rpcPayload = {
    p_company_id: companyId,
    p_original_sku: originalSku,
    p_sku: sku,
    p_name: name,
    p_is_active: !archived,
    p_warning_qty: warningQty,
    p_critical_qty: criticalQty,
    p_expected_updated_at: expectedUpdatedAt,
    p_supplier_prices: pSupplierPrices
  };

  const { data, error } = await window.sb.rpc('save_catalog_part', rpcPayload);
  if (error) throw error;

  const savedPart = data?.part || null;
  if (!savedPart || !savedPart.id) {
    throw new Error('Nie udało się zapisać części w Supabase.');
  }

  return savedPart;
};

window.setCatalogPartArchivedInSupabase = async function setCatalogPartArchivedInSupabase(sku, archived, expectedUpdatedAt, companyIdOverride) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const normalizedSku = String(sku || '').trim();
  const expectedVersion = ensureExpectedUpdatedAt(expectedUpdatedAt, 'część');
  if (!normalizedSku) throw new Error('Brak sku części.');

  const { data, error } = await window.sb.rpc('set_catalog_part_active', {
    p_company_id: companyId,
    p_sku: normalizedSku,
    p_is_active: !archived,
    p_expected_updated_at: expectedVersion
  });

  if (error) throw error;
  const savedPart = data?.part || null;
  if (!savedPart?.id) throw new Error(getCatalogConflictErrorMessage('rekord części'));
  return savedPart;
};

window.createCatalogSupplierInSupabase = async function createCatalogSupplierInSupabase(name, companyIdOverride) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const normalizedName = String(name || '').trim();
  if (!normalizedName) throw new Error('Podaj nazwę dostawcy.');
  if (normalizedName.length > 100) throw new Error('Nazwa dostawcy nie może przekraczać 100 znaków.');

  const supplierRows = await window.fetchCatalogSuppliers(companyId);
  if (supplierRows.some(row => String(row?.name || '').trim().toLowerCase() === normalizedName.toLowerCase())) {
    const error = new Error('Dostawca o tej nazwie już istnieje.');
    error.userSafe = true;
    throw error;
  }

  const { data, error } = await window.sb.rpc('create_catalog_supplier', {
    p_company_id: companyId,
    p_name: normalizedName
  });

  if (error) throw error;
  const savedSupplier = data?.supplier || null;
  if (!savedSupplier?.id) throw new Error('Nie udało się utworzyć dostawcy.');
  return savedSupplier;
};

window.saveSupplierPricesToSupabase = async function saveSupplierPricesToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(payload?.companyId);
  const supplierName = String(payload?.supplierName || '').trim();
  const pricesBySku = payload?.pricesBySku && typeof payload?.pricesBySku === 'object'
    ? payload.pricesBySku
    : {};
  const expectedUpdatedAt = ensureExpectedUpdatedAt(payload?.expectedUpdatedAt, 'dostawca');

  if (!supplierName) throw new Error('Brak nazwy dostawcy.');

  const suppliersRows = await window.fetchCatalogSuppliers(companyId);
  const supplierRow = (suppliersRows || []).find(row => String(row?.name || '').trim() === supplierName);
  if (!supplierRow?.id) throw new Error('Nie znaleziono dostawcy w Supabase.');

  const partsRows = await window.fetchCatalogParts(companyId);
  const pPrices = Object.entries(pricesBySku).map(([sku, price]) => ({
    part_id: getPartIdBySkuFromCatalogRows(partsRows, sku),
    price: requireNonNegativeNumber(price, `Cena części ${sku}`)
  }));

  const { data, error } = await window.sb.rpc('save_supplier_prices', {
    p_company_id: companyId,
    p_supplier_name: supplierName,
    p_expected_updated_at: expectedUpdatedAt,
    p_prices: pPrices
  });

  if (error) throw error;

  const savedSupplier = data?.supplier || null;
  if (!savedSupplier || !savedSupplier.id) {
    throw new Error('Nie udało się zapisać cennika dostawcy w Supabase.');
  }

  return savedSupplier;
};

window.setCatalogSupplierArchivedInSupabase = async function setCatalogSupplierArchivedInSupabase(name, archived, expectedUpdatedAt, companyIdOverride) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const normalizedName = String(name || '').trim();
  const expectedVersion = ensureExpectedUpdatedAt(expectedUpdatedAt, 'dostawca');
  if (!normalizedName) throw new Error('Brak nazwy dostawcy.');

  const { data, error } = await window.sb.rpc('set_catalog_supplier_active', {
    p_company_id: companyId,
    p_name: normalizedName,
    p_is_active: !archived,
    p_expected_updated_at: expectedVersion
  });

  if (error) throw error;
  const savedSupplier = data?.supplier || null;
  if (!savedSupplier?.id) throw new Error(getCatalogConflictErrorMessage('dostawca'));
  return savedSupplier;
};

window.saveMachineDefinitionToSupabase = async function saveMachineDefinitionToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(payload?.companyId);
  const code = String(payload?.code || '').trim();
  const name = String(payload?.name || '').trim();
  const originalCode = String(payload?.originalCode || code).trim();
  const archived = payload?.archived === true;
  const expectedUpdatedAt = normalizeNullableExpectedUpdatedAt(payload?.expectedUpdatedAt);
  const bom = Array.isArray(payload?.bom) ? payload.bom : [];

  if (!code || !name) throw new Error('Maszyna musi mieć kod i nazwę.');
  if (!/^[a-zA-Z0-9_-]+$/.test(code) || code.length > 50 || name.length > 200) {
    const error = new Error('Kod lub nazwa maszyny mają nieprawidłowy format.');
    error.userSafe = true;
    throw error;
  }

  const partsRows = await window.fetchCatalogParts(companyId);
  const seenPartIds = new Set();
  const pBom = bom.map(item => {
    const partId = getPartIdBySkuFromCatalogRows(partsRows, item?.sku);
    if (seenPartIds.has(partId)) {
      const error = new Error('Ta sama część nie może występować w BOM więcej niż raz.');
      error.userSafe = true;
      throw error;
    }
    seenPartIds.add(partId);
    return {
      part_id: partId,
      qty: requirePositiveInt(item?.qty, `Ilość części ${item?.sku || '—'} w BOM`)
    };
  });

  const rpcPayload = {
    p_company_id: companyId,
    p_original_code: originalCode,
    p_code: code,
    p_name: name,
    p_is_active: !archived,
    p_expected_updated_at: expectedUpdatedAt,
    p_bom: pBom
  };

  const { data, error } = await window.sb.rpc('save_machine_definition', rpcPayload);
  if (error) throw error;

  const savedMachine = data?.machine || null;
  if (!savedMachine || !savedMachine.id) {
    throw new Error('Nie udało się zapisać definicji maszyny.');
  }

  return savedMachine;
};

window.setMachineArchivedInSupabase = async function setMachineArchivedInSupabase(code, archived, expectedUpdatedAt, companyIdOverride) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const normalizedCode = String(code || '').trim();
  const expectedVersion = ensureExpectedUpdatedAt(expectedUpdatedAt, 'maszyna');
  if (!normalizedCode) throw new Error('Brak kodu maszyny.');

  const { data, error } = await window.sb.rpc('set_machine_definition_active', {
    p_company_id: companyId,
    p_code: normalizedCode,
    p_is_active: !archived,
    p_expected_updated_at: expectedVersion
  });

  if (error) throw error;
  const savedMachine = data?.machine || null;
  if (!savedMachine?.id) throw new Error(getCatalogConflictErrorMessage('maszyna'));
  return savedMachine;
};



function normalizeBusinessNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBusinessInt(value, fallback = 0) {
  return Math.max(0, Math.trunc(normalizeBusinessNumber(value, fallback)));
}

window.saveCompanyThresholdsToSupabase = async function saveCompanyThresholdsToSupabase(lowWarn, lowDanger, companyIdOverride) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const safeLowWarn = requireNonNegativeInt(lowWarn, 'Próg ostrzegawczy firmy');
  const safeLowDanger = requireNonNegativeInt(lowDanger, 'Próg krytyczny firmy');
  if (safeLowDanger > safeLowWarn) {
    const validationError = new Error('Próg krytyczny firmy nie może być większy niż próg ostrzegawczy.');
    validationError.userSafe = true;
    throw validationError;
  }

  const expectedUpdatedAt = ensureExpectedUpdatedAt(
    window.appAuth?.companyUpdatedAt,
    'ustawienia firmy'
  );
  const { data, error } = await window.sb.rpc('save_company_thresholds', {
    p_company_id: companyId,
    p_low_warn: safeLowWarn,
    p_low_danger: safeLowDanger,
    p_expected_updated_at: expectedUpdatedAt
  });

  if (error) throw error;
  const savedCompany = data?.company || null;
  if (!savedCompany?.id) throw new Error('Nie udało się zapisać progów firmy.');

  return {
    ...savedCompany,
    low_warn: normalizeBusinessInt(savedCompany.low_warn, safeLowWarn),
    low_danger: Math.min(
      normalizeBusinessInt(savedCompany.low_danger, safeLowDanger),
      normalizeBusinessInt(savedCompany.low_warn, safeLowWarn)
    )
  };
};

const INVENTORY_LOT_DB_FIELDS = Object.freeze({
  initialQty: 'qty_initial',
  remainingQty: 'qty_remaining',
  receivedAt: 'received_at'
});

const HISTORY_EVENT_DB_TYPE_BY_LOCAL = Object.freeze({
  delivery: 'delivery_finalized',
  build: 'production_finalized',
  adjustment: 'stock_adjustment'
});

const HISTORY_EVENT_LOCAL_TYPE_BY_DB = Object.freeze({
  delivery_finalized: 'delivery',
  production_finalized: 'build',
  stock_adjustment: 'adjustment'
});

function normalizeDateISOPrefix(value) {
  const prefix = String(value || '').trim().slice(0, 10);
  const match = prefix.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  ) ? prefix : '';
}

function getInventoryLotReceivedDateISO(row = {}, fallback = '') {
  const raw = String(row?.[INVENTORY_LOT_DB_FIELDS.receivedAt] || row?.created_at || fallback || '').trim();
  return normalizeDateISOPrefix(raw);
}

function getHistoryEventDateISO(row = {}, payload = {}) {
  const raw = String(payload?.dateISO || row?.created_at || '').trim();
  return normalizeDateISOPrefix(raw);
}

function mapDbEventTypeToLocal(dbTypeRaw) {
  const dbType = String(dbTypeRaw || '').trim().toLowerCase();
  return HISTORY_EVENT_LOCAL_TYPE_BY_DB[dbType] || null;
}

function mapLocalEventTypeToDb(localTypeRaw) {
  const localType = String(localTypeRaw || '').trim().toLowerCase();
  return HISTORY_EVENT_DB_TYPE_BY_LOCAL[localType] || null;
}

function mapUiHistoryLotToDb(lot = {}) {
  return {
    lot_id: lot?.lotId == null ? null : String(lot.lotId),
    qty: normalizeBusinessInt(lot?.qty, 0),
    removed_qty: normalizeBusinessInt(lot?.removedQty, 0),
    remaining_after: normalizeBusinessInt(lot?.remainingAfter, 0),
    sku: String(lot?.sku || '').trim(),
    name: String(lot?.name || '').trim(),
    supplier: String(lot?.supplier || '').trim() || '-',
    date_in: String(lot?.dateIn || lot?.dateISO || '').trim() || null,
    unit_price: Math.max(0, normalizeBusinessNumber(lot?.unitPrice, 0))
  };
}

function mapDbHistoryLotToUi(lot = {}) {
  const rawDate = String(lot?.date_in || lot?.dateIn || '').trim();
  return {
    lotId: lot?.lot_id == null ? (lot?.lotId == null ? null : String(lot.lotId)) : String(lot.lot_id),
    qty: normalizeBusinessInt(lot?.qty, 0),
    removedQty: normalizeBusinessInt(lot?.removed_qty ?? lot?.removedQty, 0),
    remainingAfter: normalizeBusinessInt(lot?.remaining_after ?? lot?.remainingAfter, 0),
    sku: String(lot?.sku || '').trim(),
    name: String(lot?.name || '').trim(),
    supplier: String(lot?.supplier || '-').trim() || '-',
    dateIn: normalizeDateISOPrefix(rawDate),
    unitPrice: Math.max(0, normalizeBusinessNumber(lot?.unit_price ?? lot?.unitPrice, 0))
  };
}

function mapUiHistoryEventToDbPayload(historyEvent = {}) {
  const localType = String(historyEvent?.type || '').trim().toLowerCase();
  const dateISO = String(historyEvent?.dateISO || '').trim() || '';

  if (localType === 'delivery') {
    return {
      dateISO,
      supplier: String(historyEvent?.supplier || '').trim() || '-',
      items: (Array.isArray(historyEvent?.items) ? historyEvent.items : []).map(item => ({
        sku: String(item?.sku || '').trim(),
        name: String(item?.name || '').trim(),
        qty: normalizeBusinessInt(item?.qty, 0),
        unit_price: Math.max(0, normalizeBusinessNumber(item?.price ?? item?.unitPrice, 0))
      })).filter(item => item.sku)
    };
  }

  if (localType === 'build') {
    return {
      dateISO,
      items: (Array.isArray(historyEvent?.items) ? historyEvent.items : []).map(item => ({
        code: String(item?.code || '').trim(),
        name: String(item?.name || '').trim(),
        qty: normalizeBusinessInt(item?.qty, 0),
        parts_used: (Array.isArray(item?.partsUsed) ? item.partsUsed : []).map(part => ({
          sku: String(part?.sku || '').trim(),
          name: String(part?.name || '').trim(),
          qty: normalizeBusinessInt(part?.qty, 0),
          lots: (Array.isArray(part?.lots) ? part.lots : []).map(mapUiHistoryLotToDb)
        })).filter(part => part.sku)
      })).filter(item => item.code)
    };
  }

  if (localType === 'adjustment') {
    const items = Array.isArray(historyEvent?.items)
      ? historyEvent.items
      : (Array.isArray(historyEvent?.details?.changes) ? historyEvent.details.changes : []);

    return {
      dateISO,
      parts_changed: normalizeBusinessInt(historyEvent?.partsChanged ?? items.length, items.length),
      items: items.map(item => ({
        sku: String(item?.sku || '').trim(),
        name: String(item?.name || '').trim(),
        previous_qty: normalizeBusinessInt(item?.previousQty, 0),
        new_qty: normalizeBusinessInt(item?.newQty, 0),
        diff: Math.trunc(normalizeBusinessNumber(item?.diff, 0)),
        direction: String(item?.direction || '').trim(),
        reference_unit_price: Math.max(0, normalizeBusinessNumber(item?.referenceUnitPrice, 0)),
        created_lot: item?.createdLot ? mapUiHistoryLotToDb(item.createdLot) : null,
        affected_lots: (Array.isArray(item?.affectedLots) ? item.affectedLots : []).map(mapUiHistoryLotToDb)
      })).filter(item => item.sku)
    };
  }

  return { dateISO };
}

function getHistoryEventTitle(historyEvent = {}) {
  const localType = String(historyEvent?.type || '').trim().toLowerCase();

  if (localType === 'delivery') {
    const supplier = String(historyEvent?.supplier || '').trim() || '—';
    return `Dostawa • ${supplier}`;
  }

  if (localType === 'build') {
    const count = Array.isArray(historyEvent?.items) ? historyEvent.items.length : 0;
    return count > 0 ? `Produkcja • ${count} poz.` : 'Produkcja';
  }

  if (localType === 'adjustment') {
    const count = normalizeBusinessInt(historyEvent?.partsChanged, 0) || (Array.isArray(historyEvent?.items) ? historyEvent.items.length : 0);
    return count > 0 ? `Korekta stanów • ${count} cz.` : 'Korekta stanów';
  }

  return 'Historia operacji';
}

function getHistoryEventDescription(historyEvent = {}) {
  const localType = String(historyEvent?.type || '').trim().toLowerCase();
  const dateISO = String(historyEvent?.dateISO || '').trim();

  if (localType === 'delivery') {
    const items = Array.isArray(historyEvent?.items) ? historyEvent.items : [];
    return `Przyjęto ${items.length} pozycji${dateISO ? ` • ${dateISO}` : ''}`;
  }

  if (localType === 'build') {
    const items = Array.isArray(historyEvent?.items) ? historyEvent.items : [];
    const totalQty = items.reduce((sum, item) => sum + normalizeBusinessInt(item?.qty, 0), 0);
    return `Wyprodukowano ${totalQty} szt.${dateISO ? ` • ${dateISO}` : ''}`;
  }

  if (localType === 'adjustment') {
    const items = Array.isArray(historyEvent?.items)
      ? historyEvent.items
      : (Array.isArray(historyEvent?.details?.changes) ? historyEvent.details.changes : []);
    const netDiff = items.reduce((sum, item) => sum + Math.trunc(normalizeBusinessNumber(item?.diff, 0)), 0);
    const netLabel = netDiff > 0 ? `+${netDiff}` : String(netDiff);
    return `Bilans korekty: ${netLabel}${dateISO ? ` • ${dateISO}` : ''}`;
  }

  return dateISO || '';
}

function mapDbHistoryRowToUi(row = {}, author = null) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const localType = mapDbEventTypeToLocal(row?.event_type);
  const dateISO = getHistoryEventDateISO(row, payload);
  const parsedTs = Date.parse(String(row?.created_at || '').trim());
  const ts = Number.isFinite(parsedTs) ? parsedTs : 0;
  const authorFullName = String(author?.full_name || '').trim();
  const authorEmail = String(author?.email || '').trim();
  const authorName = authorFullName || authorEmail || '—';
  const authorUserId = row?.created_by || null;

  if (localType === 'delivery') {
    return {
      id: row?.id,
      ts,
      type: 'delivery',
      authorName,
      authorEmail: authorEmail || null,
      authorUserId,
      dateISO,
      supplier: String(payload?.supplier || '-').trim() || '-',
      invoiceNumber: String((payload?.invoice_number ?? payload?.invoiceNumber ?? '')).trim() || null,
      items: (Array.isArray(payload?.items) ? payload.items : []).map(item => ({
        sku: String(item?.sku || '').trim(),
        name: String(item?.name || '').trim(),
        qty: normalizeBusinessInt(item?.qty, 0),
        price: Math.max(0, normalizeBusinessNumber(item?.unit_price ?? item?.price ?? item?.unitPrice, 0))
      })).filter(item => item.sku)
    };
  }

  if (localType === 'build') {
    return {
      id: row?.id,
      ts,
      type: 'build',
      authorName,
      authorEmail: authorEmail || null,
      authorUserId,
      dateISO,
      items: (Array.isArray(payload?.items) ? payload.items : []).map(item => ({
        code: String(item?.code || '').trim(),
        name: String(item?.name || '').trim(),
        qty: normalizeBusinessInt(item?.qty, 0),
        partsUsed: (Array.isArray(item?.parts_used) ? item.parts_used : Array.isArray(item?.partsUsed) ? item.partsUsed : []).map(part => ({
          sku: String(part?.sku || '').trim(),
          name: String(part?.name || '').trim(),
          qty: normalizeBusinessInt(part?.qty, 0),
          lots: (Array.isArray(part?.lots) ? part.lots : []).map(mapDbHistoryLotToUi)
        })).filter(part => part.sku)
      })).filter(item => item.code)
    };
  }

  if (localType === 'adjustment') {
    const items = Array.isArray(payload?.items)
      ? payload.items
      : (Array.isArray(payload?.details?.changes) ? payload.details.changes : []);

    return {
      id: row?.id,
      ts,
      type: 'adjustment',
      authorName,
      authorEmail: authorEmail || null,
      authorUserId,
      dateISO,
      partsChanged: normalizeBusinessInt(payload?.parts_changed ?? payload?.partsChanged ?? items.length, items.length),
      items: items.map(item => ({
        sku: String(item?.sku || '').trim(),
        name: String(item?.name || '').trim(),
        previousQty: normalizeBusinessInt(item?.previous_qty ?? item?.previousQty, 0),
        newQty: normalizeBusinessInt(item?.new_qty ?? item?.newQty, 0),
        diff: Math.trunc(normalizeBusinessNumber(item?.diff, 0)),
        direction: String(item?.direction || '').trim(),
        referenceUnitPrice: Math.max(0, normalizeBusinessNumber(item?.reference_unit_price ?? item?.referenceUnitPrice, 0)),
        createdLot: item?.created_lot ? mapDbHistoryLotToUi(item.created_lot) : (item?.createdLot ? mapDbHistoryLotToUi(item.createdLot) : null),
        affectedLots: (Array.isArray(item?.affected_lots) ? item.affected_lots : Array.isArray(item?.affectedLots) ? item.affectedLots : []).map(mapDbHistoryLotToUi)
      })).filter(item => item.sku)
    };
  }

  return null;
}

async function buildBusinessLookups(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  const [partsRows, suppliersRows, machineRows] = await Promise.all([
    window.fetchCatalogParts(companyId),
    window.fetchCatalogSuppliers(companyId),
    window.fetchMachineDefinitions(companyId)
  ]);

  return {
    companyId,
    partsById: new Map((partsRows || []).map(row => [row?.id, row]).filter(entry => entry[0])),
    partsBySku: new Map((partsRows || []).map(row => [String(row?.sku || '').trim().toLowerCase(), row]).filter(entry => entry[0] && entry[1])),
    suppliersById: new Map((suppliersRows || []).map(row => [row?.id, row]).filter(entry => entry[0])),
    suppliersByName: new Map((suppliersRows || []).map(row => [String(row?.name || '').trim(), row]).filter(entry => entry[0] && entry[1])),
    machinesById: new Map((machineRows || []).map(row => [row?.id, row]).filter(entry => entry[0])),
    machinesByCode: new Map((machineRows || []).map(row => [String(row?.code || '').trim(), row]).filter(entry => entry[0] && entry[1]))
  };
}

window.fetchInventoryLotsRows = async function fetchInventoryLotsRows(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from('inventory_lots')
    .select('id, company_id, part_id, supplier_id, unit_price, qty_initial, qty_remaining, received_at, created_at')
    .eq('company_id', companyId)
    .order('received_at', { ascending: true })
    .order('id', { ascending: true }));
};

window.fetchMachineStockRows = async function fetchMachineStockRows(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from('machine_stock')
    .select('id, company_id, machine_definition_id, qty, created_at')
    .eq('company_id', companyId)
    .order('id', { ascending: true }));
};

window.fetchHistoryEventRows = async function fetchHistoryEventRows(companyIdOverride) {
  const companyId = requireBusinessCompanyId(companyIdOverride);
  return fetchAllSupabasePages(() => window.sb
    .from('history_events')
    .select('id, company_id, event_type, title, description, payload, created_at, created_by')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }));
};

window.fetchProfilesByIds = async function fetchProfilesByIds(userIds = []) {
  requireBusinessCompanyId();

  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(id => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  const profiles = [];
  for (const idChunk of splitIntoChunks(ids)) {
    const chunkRows = await fetchAllSupabasePages(() => window.sb
      .from('profiles')
      .select('id, email, full_name')
      .in('id', idChunk)
      .order('id', { ascending: true }));
    profiles.push(...chunkRows);
  }
  return profiles;
};

window.fetchOperationalStateFromSupabase = async function fetchOperationalStateFromSupabase(companyIdOverride) {
  const lookups = await buildBusinessLookups(companyIdOverride);
  const [lotRows, machineStockRows, historyRows] = await Promise.all([
    window.fetchInventoryLotsRows(lookups.companyId),
    window.fetchMachineStockRows(lookups.companyId),
    window.fetchHistoryEventRows(lookups.companyId)
  ]);

  const authorIds = [...new Set((historyRows || []).map(row => String(row?.created_by || '').trim()).filter(Boolean))];
  const authorProfiles = authorIds.length ? await window.fetchProfilesByIds(authorIds) : [];
  const authorProfilesById = new Map((authorProfiles || []).map(profile => [profile?.id, profile]).filter(entry => entry[0]));

  const lots = (lotRows || []).map(row => {
    const part = lookups.partsById.get(row?.part_id) || null;
    const supplier = lookups.suppliersById.get(row?.supplier_id) || null;
    const sku = String(part?.sku || row?.sku || '').trim();
    const name = String(part?.name || row?.name || '').trim();
    if (!sku || !name) return null;
    const qtyInitial = requireNonNegativeInt(row?.qty_initial, `Ilość początkowa partii ${row?.id || '—'}`);
    const qtyRemaining = requireNonNegativeInt(row?.qty_remaining, `Ilość pozostała partii ${row?.id || '—'}`);
    if (qtyRemaining > qtyInitial) {
      throw new Error(`Partia ${row?.id || '—'} ma stan większy od ilości początkowej.`);
    }
    return {
      id: row?.id,
      sku,
      name,
      supplier: String(supplier?.name || row?.supplier_name || row?.supplier || '-').trim() || '-',
      unitPrice: requireNonNegativeNumber(row?.unit_price ?? row?.price ?? row?.unitPrice, `Cena partii ${row?.id || '—'}`),
      qty: qtyRemaining,
      qtyInitial,
      dateIn: getInventoryLotReceivedDateISO(row)
    };
  }).filter(Boolean);

  const machinesStock = (machineStockRows || []).map(row => {
    const machine = lookups.machinesById.get(row?.machine_definition_id) || null;
    const code = String(machine?.code || row?.code || '').trim();
    const name = String(machine?.name || row?.name || '').trim();
    if (!code) return null;
    return {
      code,
      name: name || code,
      qty: requireNonNegativeInt(row?.qty, `Stan maszyny ${code}`),
      _rowId: row?.id ?? null,
      _machineDefinitionId: row?.machine_definition_id ?? null
    };
  }).filter(Boolean);

  const history = (historyRows || []).map(row => mapDbHistoryRowToUi(row, authorProfilesById.get(row?.created_by) || null)).filter(Boolean);

  return { lots, machinesStock, history };
};




window.saveDeliveryToSupabase = async function saveDeliveryToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const lookups = await buildBusinessLookups(payload?.companyId);
  const supplierName = String(payload?.supplier || '').trim();
  const supplier = supplierName ? lookups.suppliersByName.get(supplierName) || null : null;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const dateISO = requireISODate(payload?.dateISO, 'Data dostawy');
  const invoiceNumber = String(payload?.invoiceNumber || '').trim();
  const receivedAt = `${dateISO}T00:00:00Z`;

  if (!supplierName) throw new Error('Brak dostawcy dla dostawy.');
  if (!supplier?.id) throw new Error(`Nie znaleziono dostawcy "${supplierName}" w Supabase.`);
  if (supplier?.is_active === false) throw new Error('Wybrany dostawca jest zarchiwizowany.');
  if (!items.length) throw new Error('Brak pozycji dostawy do zapisania.');
  if (!invoiceNumber) throw new Error('Brak numeru faktury dla dostawy.');
  if (invoiceNumber.length > 150) {
    const error = new Error('Numer faktury nie może przekraczać 150 znaków.');
    error.userSafe = true;
    throw error;
  }

  const rpcItems = items.map(item => {
    const sku = String(item?.sku || '').trim().toLowerCase();
    const part = lookups.partsBySku.get(sku);
    const qty = requirePositiveInt(item?.qty, `Ilość części ${item?.sku || '—'}`);
    if (!part?.id) throw new Error(`Nie znaleziono części ${item?.sku || '—'} w Supabase.`);
    if (part?.is_active === false) throw new Error(`Część ${item?.sku || '—'} jest zarchiwizowana.`);
    return {
      part_id: part.id,
      qty,
      unit_price: requireNonNegativeNumber(item?.price, `Cena części ${item?.sku || '—'}`)
    };
  });

  const { data, error } = await window.sb.rpc('finalize_delivery', {
    p_company_id: lookups.companyId,
    p_supplier_id: supplier.id,
    p_received_at: receivedAt,
    p_items: rpcItems,
    p_invoice_number: invoiceNumber
  });

  if (error) throw error;
  return data;
};

window.saveBuildToSupabase = async function saveBuildToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(payload?.companyId);
  const buildISO = requireISODate(payload?.buildISO, 'Data produkcji');
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const manualAllocations = payload?.manualAllocations == null
    ? null
    : (Array.isArray(payload.manualAllocations) ? payload.manualAllocations : []);
  const buildAt = `${buildISO}T00:00:00Z`;

  if (!items.length) throw new Error('Brak pozycji produkcji do zapisania.');

  const machineRows = await window.fetchMachineDefinitions(companyId);
  const machinesByCode = new Map((machineRows || []).map(row => [String(row?.code || '').trim(), row]));
  const rpcItems = items.map(item => {
    const machineCode = String(item?.machineCode || '').trim();
    const machine = machinesByCode.get(machineCode);
    if (!machine?.id || machine?.is_active === false) {
      const error = new Error(`Maszyna ${machineCode || '—'} nie jest aktywnie dostępna.`);
      error.userSafe = true;
      throw error;
    }
    return {
      machine_code: machineCode,
      qty: requirePositiveInt(item?.qty, `Ilość maszyny ${machineCode}`)
    };
  });

  const invalidItem = rpcItems.find(item => !item.machine_code || item.qty <= 0);
  if (invalidItem) throw new Error('Każda pozycja produkcji musi mieć wybraną maszynę i ilość większą od zera.');

  const rpcManualAllocations = manualAllocations === null
    ? null
    : manualAllocations.map(item => ({
        lot_id: String(item?.lotId || '').trim(),
        sku: String(item?.sku || '').trim(),
        qty: requirePositiveInt(item?.qty, `Ręczna alokacja partii ${item?.lotId || '—'}`)
      }));

  const invalidManualAllocation = Array.isArray(rpcManualAllocations)
    ? rpcManualAllocations.find(item => !item.lot_id || !item.sku || item.qty <= 0)
    : null;
  if (invalidManualAllocation) {
    throw new Error('Każda ręczna alokacja musi wskazywać partię, część i ilość większą od zera.');
  }
  if (Array.isArray(rpcManualAllocations)) {
    const lotIds = rpcManualAllocations.map(item => item.lot_id);
    if (new Set(lotIds).size !== lotIds.length) {
      const error = new Error('Ta sama partia nie może występować w ręcznej alokacji więcej niż raz.');
      error.userSafe = true;
      throw error;
    }
  }

  const { data, error } = await window.sb.rpc('finalize_production', {
    p_company_id: companyId,
    p_build_date: buildAt,
    p_items: rpcItems,
    p_manual_allocations: rpcManualAllocations
  });

  if (error) throw error;
  return data;
};


window.saveStockAdjustmentToSupabase = async function saveStockAdjustmentToSupabase(payload = {}) {
  requireBusinessWriteReady();
  const companyId = requireBusinessCompanyId(payload?.companyId);
  const dateISO = requireISODate(payload?.dateISO, 'Data korekty');
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const adjustmentAt = `${dateISO}T00:00:00Z`;

  if (!items.length) throw new Error('Brak pozycji korekty stanów do zapisania.');

  const rpcItems = items.map(item => ({
    sku: String(item?.sku || '').trim(),
    previous_qty: requireNonNegativeInt(item?.previousQty, `Poprzedni stan części ${item?.sku || '—'}`),
    new_qty: requireNonNegativeInt(item?.newQty, `Nowy stan części ${item?.sku || '—'}`),
    reference_unit_price: requireNonNegativeNumber(item?.referenceUnitPrice, `Cena referencyjna części ${item?.sku || '—'}`)
  }));

  const invalidItem = rpcItems.find(item => !item.sku || item.previous_qty === item.new_qty);
  if (invalidItem) throw new Error('Każda korekta musi mieć sku i rzeczywiście zmieniać stan.');
  const skuKeys = rpcItems.map(item => item.sku.toLowerCase());
  if (new Set(skuKeys).size !== skuKeys.length) {
    const error = new Error('Ta sama część nie może występować w korekcie więcej niż raz.');
    error.userSafe = true;
    throw error;
  }

  const { data, error } = await window.sb.rpc('apply_stock_adjustment', {
    p_company_id: companyId,
    p_date: adjustmentAt,
    p_items: rpcItems
  });

  if (error) throw error;
  return data;
};

window.testSupabaseConnection = async function testSupabaseConnection() {
  const result = await window.refreshAuthContext();
  return {
    ok: result?.ok === true,
    loggedIn: !!window.appAuth?.session,
    companyLoaded: window.appAuth?.companyLoaded === true,
    rolePermissionsLoaded: window.appAuth?.rolePermissionsLoaded === true,
    role: window.appAuth?.companyRole || null
  };
};
