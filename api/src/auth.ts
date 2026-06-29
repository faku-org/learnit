import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);
const JWT_EXPIRY = "7d";

const googleEnv = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `http://localhost:${process.env.PORT ?? 3001}/api/auth/google/callback`,
  appUrl: process.env.APP_URL ?? "http://localhost:4321",
});

export type JWTPayload = {
  userId: string;
  email: string;
};

export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export function googleAuthUrl(): string {
  const { clientId, redirectUri } = googleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
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

export function frontendCallbackUrl(jwt: string): string {
  return `${googleEnv().appUrl}/verify?jwt=${encodeURIComponent(jwt)}`;
}

export async function extractUserFromHeader(
  authorization: string | undefined,
): Promise<JWTPayload | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;
  return verifyJWT(token);
}
