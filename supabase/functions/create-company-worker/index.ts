import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

type RequestBody = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  companyId?: unknown;
  fullName?: unknown;
};

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

const MAX_BODY_BYTES = 16_384;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeLog(context: string, error: unknown) {
  const value = (error && typeof error === "object")
    ? error as ErrorLike
    : {};

  console.error(context, {
    name: typeof value.name === "string" ? value.name : "Error",
    code: typeof value.code === "string" ? value.code : null,
    status: typeof value.status === "number" ? value.status : null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (req.method !== "POST") {
    return json(405, {
      ok: false,
      error: "method_not_allowed",
      message: "Dozwolona jest tylko metoda POST.",
    });
  }

  try {
    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json(413, {
        ok: false,
        error: "payload_too_large",
        message: "Przesłane dane są zbyt duże.",
      });
    }

    const contentType = String(req.headers.get("content-type") || "")
      .toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return json(415, {
        ok: false,
        error: "unsupported_media_type",
        message: "Treść żądania musi być przekazana jako JSON.",
      });
    }

    const rawBody = await req.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return json(413, {
        ok: false,
        error: "payload_too_large",
        message: "Przesłane dane są zbyt duże.",
      });
    }

    let body: RequestBody;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(rawBody));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Body must be an object.");
      }
      body = parsed as RequestBody;
    } catch {
      return json(400, {
        ok: false,
        error: "invalid_json",
        message: "Treść żądania musi być poprawnym obiektem JSON.",
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabasePublishableKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";
    const supabaseServiceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabasePublishableKey || !supabaseServiceRoleKey) {
      return json(500, {
        ok: false,
        error: "missing_env",
        message: "Funkcja nie jest poprawnie skonfigurowana.",
      });
    }

    const authHeader = String(req.headers.get("Authorization") || "").trim();
    if (!/^Bearer\s+\S+$/i.test(authHeader)) {
      return json(401, {
        ok: false,
        error: "missing_authorization",
        message: "Brak poprawnego nagłówka Authorization.",
      });
    }

    const fullName = typeof body.fullName === "string"
      ? body.fullName.trim()
      : "";
    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
    const password = typeof body.password === "string" ? body.password : "";
    const requestedRole = typeof body.role === "string"
      ? body.role.trim().toLowerCase()
      : "worker";
    const requestedCompanyId = typeof body.companyId === "string" &&
        body.companyId.trim()
      ? body.companyId.trim()
      : null;

    if (!fullName || fullName.length > 150) {
      return json(400, {
        ok: false,
        error: "invalid_full_name",
        message:
          "Imię i nazwisko jest wymagane i może mieć maksymalnie 150 znaków.",
      });
    }
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return json(400, {
        ok: false,
        error: "invalid_email",
        message: "Podaj poprawny adres e-mail.",
      });
    }
    if (!password || password.length < 6 || password.length > 128) {
      return json(400, {
        ok: false,
        error: "invalid_password",
        message: "Hasło musi mieć od 6 do 128 znaków.",
      });
    }
    if (!["worker", "admin"].includes(requestedRole)) {
      return json(400, {
        ok: false,
        error: "invalid_role",
        message:
          "Można utworzyć wyłącznie użytkownika z rolą worker albo admin.",
      });
    }
    if (requestedCompanyId && !UUID_PATTERN.test(requestedCompanyId)) {
      return json(400, {
        ok: false,
        error: "invalid_company_id",
        message: "Identyfikator firmy ma nieprawidłowy format.",
      });
    }

    const callerClient = createClient(supabaseUrl, supabasePublishableKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: callerUser },
      error: callerUserError,
    } = await callerClient.auth.getUser();

    if (callerUserError || !callerUser) {
      return json(401, {
        ok: false,
        error: "invalid_session",
        message: "Sesja użytkownika jest nieprawidłowa lub wygasła.",
      });
    }

    const { data: callerProfile, error: callerProfileError } =
      await adminClient
        .from("profiles")
        .select("id, is_active")
        .eq("id", callerUser.id)
        .maybeSingle();

    if (callerProfileError) {
      safeLog("create-company-worker profile lookup failed", callerProfileError);
      return json(500, {
        ok: false,
        error: "authorization_check_failed",
        message: "Nie udało się potwierdzić uprawnień użytkownika.",
      });
    }
    if (!callerProfile?.id || callerProfile.is_active !== true) {
      return json(403, {
        ok: false,
        error: "inactive_profile",
        message: "Profil użytkownika jest nieaktywny.",
      });
    }

    const { data: ownerMemberships, error: membershipError } =
      await adminClient
        .from("company_members")
        .select("id, company_id")
        .eq("user_id", callerUser.id)
        .eq("is_active", true)
        .eq("role", "owner")
        .limit(2);

    if (membershipError) {
      safeLog("create-company-worker membership lookup failed", membershipError);
      return json(500, {
        ok: false,
        error: "authorization_check_failed",
        message: "Nie udało się potwierdzić uprawnień użytkownika.",
      });
    }
    if (!Array.isArray(ownerMemberships) || ownerMemberships.length !== 1) {
      return json(403, {
        ok: false,
        error: "forbidden",
        message:
          "Tylko aktywny owner dokładnie jednej firmy może tworzyć użytkowników.",
      });
    }

    const effectiveCompanyId = String(ownerMemberships[0].company_id || "");
    if (!UUID_PATTERN.test(effectiveCompanyId)) {
      return json(403, {
        ok: false,
        error: "invalid_membership",
        message: "Członkostwo użytkownika jest nieprawidłowe.",
      });
    }
    if (requestedCompanyId && requestedCompanyId !== effectiveCompanyId) {
      return json(403, {
        ok: false,
        error: "company_mismatch",
        message: "Nie można utworzyć użytkownika w innej firmie.",
      });
    }

    const { data: activeCompany, error: companyError } = await adminClient
      .from("companies")
      .select("id, is_active")
      .eq("id", effectiveCompanyId)
      .maybeSingle();

    if (companyError) {
      safeLog("create-company-worker company lookup failed", companyError);
      return json(500, {
        ok: false,
        error: "authorization_check_failed",
        message: "Nie udało się potwierdzić aktywności firmy.",
      });
    }
    if (!activeCompany?.id || activeCompany.is_active !== true) {
      return json(403, {
        ok: false,
        error: "inactive_company",
        message: "Firma jest nieaktywna.",
      });
    }

    const { data: existingProfile, error: existingProfileError } =
      await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();

    if (existingProfileError) {
      safeLog(
        "create-company-worker existing profile lookup failed",
        existingProfileError,
      );
      return json(500, {
        ok: false,
        error: "existing_user_lookup_failed",
        message: "Nie udało się sprawdzić istniejącego użytkownika.",
      });
    }
    if (existingProfile?.id) {
      return json(409, {
        ok: false,
        error: "email_already_exists",
        message: "Użytkownik z takim adresem e-mail już istnieje.",
      });
    }

    const { data: createdUserData, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createUserError || !createdUserData?.user) {
      const errorCode = String((createUserError as ErrorLike | null)?.code || "");
      const conflict = [
        "email_exists",
        "user_already_exists",
        "email_conflict_identity_not_deletable",
      ].includes(errorCode);

      safeLog("create-company-worker auth user creation failed", createUserError);
      return json(conflict ? 409 : 400, {
        ok: false,
        error: conflict ? "email_already_exists" : "create_user_failed",
        message: conflict
          ? "Użytkownik z takim adresem e-mail już istnieje."
          : "Nie udało się utworzyć użytkownika.",
      });
    }

    const newUser = createdUserData.user;

    const cleanupUser = async () => {
      try {
        const { error } = await adminClient.auth.admin.deleteUser(newUser.id);
        if (error) {
          safeLog("create-company-worker cleanup failed", error);
          return false;
        }
        return true;
      } catch (error) {
        safeLog("create-company-worker cleanup threw", error);
        return false;
      }
    };

    const { data: provisionResult, error: provisionError } =
      await adminClient.rpc("provision_company_user", {
        p_caller_user_id: callerUser.id,
        p_new_user_id: newUser.id,
        p_email: email,
        p_full_name: fullName,
        p_role: requestedRole,
        p_requested_company_id: effectiveCompanyId,
      });

    if (provisionError || !provisionResult?.membership?.id) {
      safeLog("create-company-worker provisioning failed", provisionError);
      const cleanupSucceeded = await cleanupUser();

      return json(500, {
        ok: false,
        error: cleanupSucceeded
          ? "provisioning_failed"
          : "provisioning_and_cleanup_failed",
        message: cleanupSucceeded
          ? "Nie udało się przypisać użytkownika do firmy."
          : "Nie udało się dokończyć operacji. Administrator musi sprawdzić konto.",
      });
    }

    return json(200, {
      ok: true,
      message:
        `Użytkownik z rolą ${requestedRole} został utworzony i przypisany do firmy.`,
      user: {
        id: newUser.id,
        email,
      },
      membership: provisionResult.membership,
    });
  } catch (error) {
    safeLog("create-company-worker unexpected failure", error);
    return json(500, {
      ok: false,
      error: "internal_error",
      message: "Wystąpił wewnętrzny błąd funkcji.",
    });
  }
});
