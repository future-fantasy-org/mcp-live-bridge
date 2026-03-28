import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlb-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTmp(filename: string, content: string) {
    fs.writeFileSync(path.join(tmpDir, filename), content);
  }

  it('loads YAML config', () => {
    writeTmp('test.yaml', `
name: yaml-bridge
auth:
  provider: form
  config:
    login_url: https://example.com/login
    username: u
    password: p
tools:
  - name: t1
    description: test
    url: https://api.example.com/t
    method: GET
`);
    const config = loadConfig(path.join(tmpDir, 'test.yaml'));
    expect(config.name).toBe('yaml-bridge');
  });

  it('loads JSON config', () => {
    writeTmp('test.json', JSON.stringify({
      name: 'json-bridge',
      auth: { provider: 'form', config: { login_url: 'https://x.com', username: 'u', password: 'p' } },
      tools: [{ name: 't1', description: 'test', url: 'https://api.example.com/t', method: 'GET' }],
    }));
    const config = loadConfig(path.join(tmpDir, 'test.json'));
    expect(config.name).toBe('json-bridge');
  });

  it('loads TOML config', () => {
    writeTmp('test.toml', `
name = "toml-bridge"

[auth]
provider = "form"

[auth.config]
login_url = "https://example.com/login"
username = "u"
password = "p"

[[tools]]
name = "t1"
description = "test"
url = "https://api.example.com/t"
method = "GET"
`);
    const config = loadConfig(path.join(tmpDir, 'test.toml'));
    expect(config.name).toBe('toml-bridge');
  });

  it('throws on unsupported file extension', () => {
    writeTmp('test.xml', '<config/>');
    expect(() => loadConfig(path.join(tmpDir, 'test.xml'))).toThrow('Unsupported config format');
  });

  it('throws on invalid config content', () => {
    writeTmp('test.yaml', 'name: bad\nauth:');
    expect(() => loadConfig(path.join(tmpDir, 'test.yaml'))).toThrow();
  });
});
