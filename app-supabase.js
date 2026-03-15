// === SUPABASE BOOTSTRAP ===

window.APP_SUPABASE_CONFIG = {
  url: "https://vprzhxqgotxrmrjslzll.supabase.co",
  key: "sb_publishable_tQQWuI1oZN3VQ814S3eFOg_4Mi25nFD"
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
      companyRole: null,
      companyUsers: []
    };
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Biblioteka Supabase nie została załadowana.");
    window.sb = null;
    return;
  }

  const client = window.supabase.createClient(url, key);

  window.sb = client;
  window.appAuth = {
    client,
    session: null,
    user: null,
    profile: null,
    membership: null,
    companyId: null,
    companyRole: null,
    companyUsers: []
  };
})();

window.refreshAuthContext = async function refreshAuthContext() {
  if (!window.sb) {
    return {
      ok: false,
      reason: "missing_client"
    };
  }

  const { data: sessionData, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError) {
    console.error("Błąd getSession:", sessionError);
    return {
      ok: false,
      reason: "session_error",
      error: sessionError
    };
  }

  const session = sessionData?.session || null;
  const user = session?.user || null;

  window.appAuth.session = session;
  window.appAuth.user = user;
  window.appAuth.profile = null;
  window.appAuth.membership = null;
  window.appAuth.companyId = null;
  window.appAuth.companyRole = null;
  window.appAuth.companyUsers = [];

  if (!user) {
    return {
      ok: true,
      loggedIn: false
    };
  }

  const { data: profile, error: profileError } = await window.sb
    .from("profiles")
    .select("id, email, full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Błąd pobierania profilu:", profileError);
    return {
      ok: false,
      reason: "profile_error",
      error: profileError
    };
  }

  const { data: membership, error: membershipError } = await window.sb
    .from("company_members")
    .select("id, role, company_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Błąd pobierania company_members:", membershipError);
    return {
      ok: false,
      reason: "membership_error",
      error: membershipError
    };
  }

  window.appAuth.profile = profile || null;
  window.appAuth.membership = membership || null;
  window.appAuth.companyId = membership?.company_id || null;
  window.appAuth.companyRole = membership?.role || null;

  return {
    ok: true,
    loggedIn: true,
    user,
    profile,
    membership
  };
};

window.signInWithPassword = async function signInWithPassword(email, password) {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const { data, error } = await window.sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  await window.refreshAuthContext();
  return data;
};

window.signOutApp = async function signOutApp() {
  if (!window.sb) throw new Error("Brak klienta Supabase.");

  const { error } = await window.sb.auth.signOut();
  if (error) throw error;

  await window.refreshAuthContext();
};

window.testSupabaseConnection = async function testSupabaseConnection() {
  const result = await window.refreshAuthContext();
  console.log("SUPABASE TEST RESULT:", result);
  console.log("APP AUTH:", window.appAuth);
  return result;
};

window.fetchCompanyUsers = async function fetchCompanyUsers() {
  if (!window.sb) return { ok: false, reason: "missing_client" };
  const companyId = window.appAuth?.companyId || null;
  if (!companyId) return { ok: false, reason: "missing_company" };

  const { data: members, error: membersError } = await window.sb
    .from("company_members")
    .select("id, user_id, role, is_active, company_id")
    .eq("company_id", companyId);

  if (membersError) {
    console.error("Błąd pobierania użytkowników firmy:", membersError);
    return { ok: false, reason: "members_error", error: membersError };
  }

  const userIds = Array.from(new Set((members || []).map(m => m?.user_id).filter(Boolean)));
  let profiles = [];

  if (userIds.length) {
    const { data: profileRows, error: profilesError } = await window.sb
      .from("profiles")
      .select("id, email, full_name, is_active")
      .in("id", userIds);

    if (profilesError) {
      console.error("Błąd pobierania profili firmy:", profilesError);
      return { ok: false, reason: "profiles_error", error: profilesError };
    }

    profiles = Array.isArray(profileRows) ? profileRows : [];
  }

  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const users = (members || [])
    .map(member => {
      const profile = profilesById.get(member.user_id) || null;
      return {
        membershipId: member.id,
        userId: member.user_id,
        companyId: member.company_id,
        role: member.role,
        isActive: !!member.is_active,
        email: profile?.email || "",
        fullName: profile?.full_name || "",
        profileIsActive: profile?.is_active ?? null
      };
    })
    .sort((a, b) => {
      const roleOrder = { owner: 0, admin: 1, worker: 2 };
      const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return String(a.email || a.fullName || a.userId).localeCompare(String(b.email || b.fullName || b.userId), "pl");
    });

  window.appAuth.companyUsers = users;
  return { ok: true, users };
};

window.updateCompanyMemberAccess = async function updateCompanyMemberAccess(membershipId, patch = {}) {
  if (!window.sb) return { ok: false, reason: "missing_client" };
  const companyId = window.appAuth?.companyId || null;
  if (!companyId) return { ok: false, reason: "missing_company" };

  const payload = {};
  if (typeof patch.role === "string" && patch.role.trim()) payload.role = patch.role.trim();
  if (typeof patch.is_active === "boolean") payload.is_active = patch.is_active;

  if (!Object.keys(payload).length) {
    return { ok: false, reason: "empty_patch" };
  }

  const { data, error } = await window.sb
    .from("company_members")
    .update(payload)
    .eq("id", membershipId)
    .eq("company_id", companyId)
    .select("id, user_id, role, is_active, company_id")
    .maybeSingle();

  if (error) {
    console.error("Błąd aktualizacji company_members:", error);
    return { ok: false, reason: "update_error", error };
  }

  return { ok: true, membership: data || null };
};

window.inviteCompanyWorker = async function inviteCompanyWorker(email, role = "worker") {
  if (!window.sb) return { ok: false, reason: "missing_client" };

  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanRole = String(role || "worker").trim().toLowerCase() || "worker";
  const companyId = window.appAuth?.companyId || null;

  if (!cleanEmail) return { ok: false, reason: "missing_email" };
  if (!companyId) return { ok: false, reason: "missing_company" };

  const { data, error } = await window.sb.functions.invoke("invite-company-user", {
    body: {
      email: cleanEmail,
      role: cleanRole,
      company_id: companyId
    }
  });

  if (error) {
    console.error("Błąd invite-company-user:", error);
    return { ok: false, reason: "function_error", error };
  }

  return { ok: true, data };
};
