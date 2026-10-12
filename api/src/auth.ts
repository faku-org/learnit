const googleEnv = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `http://localhost:${process.env.PORT ?? 3001}/api/auth/google/callback`,
  appUrl: process.env.APP_URL ?? "http://localhost:4321",
});

export function googleAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleUser = {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
};

export async function exchangeGoogleCode(code: string): Promise<GoogleUser | null> {
  const { clientId, clientSecret, redirectUri } = googleEnv();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;

  const tokens = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) return null;

  const u = (await userRes.json()) as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
  return { googleId: u.id, email: u.email, name: u.name, picture: u.picture };
}

/** Where the browser lands after a Google sign-in. The session is already in a cookie: nothing rides the URL. */
export const appUrl = (path = "/"): string => `${googleEnv().appUrl}${path}`;
