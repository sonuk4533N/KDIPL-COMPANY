import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).optional().or(z.literal("")),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).optional().or(z.literal("")),
  FILE_STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  FILE_STORAGE_LOCAL_PATH: z.string().default(".data/uploads"),
  FILE_STORAGE_BUCKET: z.string().optional(),
  FILE_STORAGE_REGION: z.string().optional(),
  FILE_STORAGE_ENDPOINT: optionalUrl,
  FILE_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  FILE_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  FILE_STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  FILE_STORAGE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10_485_760),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type AppEnvironment = z.infer<typeof envSchema>;

export function parseEnv(
  input: Record<string, string | undefined>,
): AppEnvironment {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid application environment: ${details}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
