export interface AccountEnv {
  DB: D1Database;
  LICENSE_SIGNING_PRIVATE_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  AUTH_SECRET: string;
}
