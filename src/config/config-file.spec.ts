import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSecretsFromMount } from './config-file';

/**
 * Proves the scaffold reads Key Vault secrets key-per-file from the CSI tmpfs
 * mount path (NODE-D6) — the security best practice equivalent of .NET
 * `AddKeyPerFile`. The mount is simulated with a temp directory.
 */
describe('loadSecretsFromMount (CSI tmpfs file mount, NODE-D6)', () => {
  let mountDir: string;

  beforeEach(() => {
    mountDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csi-secrets-'));
    fs.writeFileSync(path.join(mountDir, 'DbConnectionString'), 'Server=db;Trusted=true\n');
    fs.writeFileSync(path.join(mountDir, 'API-KEY'), 'super-secret-key');
    process.env.ContainerMode = 'true';
    process.env.SECRETS_MOUNT_PATH = mountDir;
  });

  afterEach(() => {
    delete process.env.ContainerMode;
    delete process.env.SECRETS_MOUNT_PATH;
    fs.rmSync(mountDir, { recursive: true, force: true });
  });

  it('reads each secret file as key-per-file and trims whitespace', () => {
    const secrets = loadSecretsFromMount();
    expect(secrets.DbConnectionString).toBe('Server=db;Trusted=true');
    expect(secrets['API-KEY']).toBe('super-secret-key');
  });

  it('returns nothing when not in container mode (local dev uses config files / env)', () => {
    delete process.env.ContainerMode;
    expect(loadSecretsFromMount()).toEqual({});
  });

  it('returns nothing when the mount path is absent', () => {
    process.env.SECRETS_MOUNT_PATH = path.join(mountDir, 'does-not-exist');
    expect(loadSecretsFromMount()).toEqual({});
  });
});
