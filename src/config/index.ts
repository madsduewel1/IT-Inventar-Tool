import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Config {
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
  imap: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
  redisUrl: string;
  templateDir: string;
}

function getEnv(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (required && (!value || value.trim() === '')) {
    throw new Error(`Missing required env variable ${name}`);
  }
  return value;
}

const config: Config = {
  smtp: {
    host: getEnv('SMTP_HOST') as string,
    port: parseInt(getEnv('SMTP_PORT') as string, 10),
    user: getEnv('SMTP_USER') as string,
    pass: getEnv('SMTP_PASS') as string,
    from: getEnv('SMTP_FROM') as string,
  },
  imap: {
    host: getEnv('IMAP_HOST') as string,
    port: parseInt(getEnv('IMAP_PORT') as string, 10),
    user: getEnv('IMAP_USER') as string,
    pass: getEnv('IMAP_PASS') as string,
  },
  redisUrl: getEnv('REDIS_URL') as string,
  templateDir: path.resolve(process.cwd(), 'src', 'mail', 'outgoing', 'templates'),
};

export default config;
