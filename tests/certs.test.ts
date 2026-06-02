import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateJwtCertPaths,
  runGenerateCerts,
} from "../framework/cli/generate-certs.ts";

describe("generate-certs", () => {
  test("writes RSA PEM key pair under cert/<profile>/", () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-certs-"));

    try {
      const paths = runGenerateCerts({ profile: "staging", root, comment: "test-staging" });

      expect(existsSync(paths.privateKey)).toBe(true);
      expect(existsSync(paths.publicKey)).toBe(true);

      const privatePem = readFileSync(paths.privateKey, "utf8");
      const publicPem = readFileSync(paths.publicKey, "utf8");

      expect(privatePem).toContain("BEGIN RSA PRIVATE KEY");
      expect(publicPem).toContain("BEGIN RSA PUBLIC KEY");
      expect(paths.directory).toBe(join(root, "cert", "staging"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses overwrite unless --force", () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-certs-force-"));

    try {
      runGenerateCerts({ profile: "development", root });
      expect(() => runGenerateCerts({ profile: "development", root })).toThrow(
        /already exist/,
      );

      const paths = runGenerateCerts({ profile: "development", root, force: true });
      expect(existsSync(paths.privateKey)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("generateJwtCertPaths resolves project layout", () => {
    const paths = generateJwtCertPaths("production", "/app");
    expect(paths.directory).toBe(join("/app", "cert", "production"));
    expect(paths.privateKey).toBe(join("/app", "cert", "production", "id_rsa"));
    expect(paths.publicKey).toBe(join("/app", "cert", "production", "id_rsa.pub"));
  });
});
