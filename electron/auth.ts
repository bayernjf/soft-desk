import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { app, safeStorage } from 'electron';

// 登录模块数据归属(见 Technical-Architecture.md §6.5):
// - 账号身份(userId/email/密码哈希/会员状态)= 云端最小必要集;本仓库无独立后端,
//   由主进程以 accounts.json 模拟"账号服务器",密码仅以 scrypt 加盐哈希存储,绝不存明文。
//   真实部署时,把本文件内的 register/login 替换为对远程 API 的调用即可。
// - 登录 Token = 本机敏感凭证,经 safeStorage 加密后落盘 session.bin,严禁进 localStorage。
// - 软件清单/使用记录/AI 密钥等业务数据全部本地,绝不出现在账号库或会话中。

export interface AuthProfile {
  userId: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  plan: 'free' | 'pro';
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  loggedIn: boolean;
  profile?: AuthProfile;
}

export type AuthResult =
  | { success: true; profile: AuthProfile }
  | { success: false; error: string };

interface AccountRecord extends AuthProfile {
  passwordHash: string;
  salt: string;
}

interface StoredSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const SCRYPT_KEYLEN = 64;
const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function accountsPath(): string {
  return path.join(app.getPath('userData'), 'accounts.json');
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'session.bin');
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loadAccounts(): AccountRecord[] {
  try {
    const raw = JSON.parse(readFileSync(accountsPath(), 'utf-8'));
    return Array.isArray(raw) ? (raw as AccountRecord[]) : [];
  } catch {
    return [];
  }
}

function persistAccounts(accounts: AccountRecord[]): void {
  try {
    writeFileSync(accountsPath(), JSON.stringify(accounts), 'utf-8');
  } catch {
    // 落盘失败不抛出,避免阻断登录主流程
  }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// 仅暴露脱敏资料给渲染层:绝不包含 passwordHash / salt / Token
function toProfile(record: AccountRecord): AuthProfile {
  return {
    userId: record.userId,
    email: record.email,
    nickname: record.nickname,
    avatarUrl: record.avatarUrl,
    plan: record.plan,
    emailVerified: record.emailVerified,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
  };
}

// 用 safeStorage 加密 Token 后落盘;不可用时(部分 Linux 无 keyring)安全跳过持久化,
// 仅维持内存会话,绝不明文落盘。
function persistSession(session: StoredSession): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    writeFileSync(sessionPath(), encrypted);
  } catch {
    // 落盘失败仅影响"重启后保持登录",不影响本次会话
  }
}

function readStoredSession(): StoredSession | null {
  try {
    if (!existsSync(sessionPath()) || !safeStorage.isEncryptionAvailable()) return null;
    const buf = readFileSync(sessionPath());
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as StoredSession;
    if (!parsed || typeof parsed.userId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  try {
    if (existsSync(sessionPath())) unlinkSync(sessionPath());
  } catch {
    // 忽略删除失败
  }
}

let currentSession: StoredSession | null = null;
let sessionLoaded = false;

function ensureSessionLoaded(): void {
  if (sessionLoaded) return;
  sessionLoaded = true;
  currentSession = readStoredSession();
}

function issueSession(userId: string): void {
  currentSession = {
    userId,
    accessToken: randomBytes(32).toString('hex'),
    refreshToken: randomBytes(32).toString('hex'),
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  };
  persistSession(currentSession);
}

export function register(rawEmail: unknown, rawPassword: unknown, rawNickname?: unknown): AuthResult {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const nickname =
    typeof rawNickname === 'string' && rawNickname.trim() ? rawNickname.trim() : email.split('@')[0];

  if (!isValidEmail(email)) return { success: false, error: '请输入有效的邮箱地址' };
  if (password.length < 6) return { success: false, error: '密码至少 6 位' };

  const accounts = loadAccounts();
  if (accounts.some((a) => a.email === email)) {
    return { success: false, error: '该邮箱已注册' };
  }

  const salt = randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const record: AccountRecord = {
    userId: randomUUID(),
    email,
    nickname,
    avatarUrl: null,
    plan: 'free',
    emailVerified: false,
    createdAt: now,
    lastLoginAt: now,
    passwordHash: hashPassword(password, salt),
    salt,
  };
  accounts.push(record);
  persistAccounts(accounts);

  issueSession(record.userId);
  return { success: true, profile: toProfile(record) };
}

export function login(rawEmail: unknown, rawPassword: unknown): AuthResult {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!isValidEmail(email)) return { success: false, error: '请输入有效的邮箱地址' };
  if (!password) return { success: false, error: '请输入密码' };

  const accounts = loadAccounts();
  const record = accounts.find((a) => a.email === email);
  // 不区分"邮箱不存在"与"密码错误",避免账号枚举
  if (!record || !verifyPassword(password, record.salt, record.passwordHash)) {
    return { success: false, error: '邮箱或密码错误' };
  }

  record.lastLoginAt = new Date().toISOString();
  persistAccounts(accounts);

  issueSession(record.userId);
  return { success: true, profile: toProfile(record) };
}

export function logout(): void {
  currentSession = null;
  clearStoredSession();
}

export function getSession(): AuthSession {
  ensureSessionLoaded();
  if (!currentSession) return { loggedIn: false };

  if (currentSession.expiresAt <= Date.now()) {
    // Token 过期:清理会话,要求重新登录(此处未接入远程 refresh)
    logout();
    return { loggedIn: false };
  }

  const accounts = loadAccounts();
  const record = accounts.find((a) => a.userId === currentSession!.userId);
  if (!record) {
    logout();
    return { loggedIn: false };
  }
  return { loggedIn: true, profile: toProfile(record) };
}
