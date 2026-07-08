import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { request } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUTH_FILE = resolve(__dirname, '.auth', 'user.json');

const API_URL = 'http://localhost:8080';
const TEST_EMAIL = 'admin@admin.com';
const TEST_PASSWORD = 'Admin123!';
const TEST_IDENTIFICATION = '0000000000';

async function globalSetup(): Promise<void> {
  const ctx = await request.newContext();

  const resp = await ctx.post(`${API_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  // Si el usuario no existe (base de datos fresca), lo registramos
  if (resp.status() === 401) {
    console.log('Usuario admin no existe, registrando...');
    const registerResp = await ctx.post(`${API_URL}/auth/register`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD, identification: TEST_IDENTIFICATION },
    });

    if (!registerResp.ok()) {
      const body = await registerResp.text();
      throw new Error(`No se pudo registrar admin: ${registerResp.status()} ${body}`);
    }

    const registerBody = await registerResp.json();
    const { accessToken, refreshToken } = registerBody;
    saveTokens(accessToken, refreshToken);
    console.log('✓ Usuario admin registrado exitosamente');
    return;
  }

  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`No se pudo autenticar admin: ${resp.status()} ${body}`);
  }

  const { accessToken, refreshToken } = await resp.json();
  saveTokens(accessToken, refreshToken);
  console.log('✓ Sesión de admin iniciada exitosamente');
}

function saveTokens(accessToken: string, refreshToken: string): void {
  const dir = resolve(__dirname, '.auth');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:5173',
        localStorage: [
          { name: 'accessToken', value: accessToken },
          { name: 'refreshToken', value: refreshToken },
        ],
      },
    ],
  };

  writeFileSync(AUTH_FILE, JSON.stringify(storageState, null, 2));
}

export default globalSetup;
