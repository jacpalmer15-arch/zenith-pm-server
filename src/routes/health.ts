import { Router, Request, Response } from 'express';
import { successResponse } from '@/types/response.js';
import { env } from '@/config/env.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HealthData {
  status: 'up';
  version: string;
  env: string;
}

interface VersionData {
  version: string;
  gitSha?: string;
}

interface PackageJson {
  version?: string;
}

// Get version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as PackageJson;
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// Get git SHA if available
function getGitSha(): string | undefined {
  try {
    // Try to read from environment (common in CI/CD)
    return process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  } catch {
    return undefined;
  }
}

router.get('/health', (_req: Request, res: Response) => {
  const data: HealthData = {
    status: 'up',
    version: getVersion(),
    env: env.NODE_ENV,
  };
  
  res.json(successResponse(data));
});

router.get('/version', (_req: Request, res: Response) => {
  const data: VersionData = {
    version: getVersion(),
  };
  
  const gitSha = getGitSha();
  if (gitSha) {
    data.gitSha = gitSha;
  }
  
  res.json(successResponse(data));
});

export default router;
