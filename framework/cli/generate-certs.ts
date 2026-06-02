import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OvenlessProfile } from "../config.ts";

export interface GenerateCertsOptions {
  profile: OvenlessProfile;
  root?: string;
  /** PEM key comment (informational; embedded in OpenSSH-style headers when applicable) */
  comment?: string;
  force?: boolean;
  modulusLength?: number;
}

export interface GeneratedCertPaths {
  directory: string;
  privateKey: string;
  publicKey: string;
}

export function generateJwtCertPaths(
  profile: OvenlessProfile,
  root = process.cwd(),
): GeneratedCertPaths {
  const directory = join(root, "cert", profile);
  return {
    directory,
    privateKey: join(directory, "id_rsa"),
    publicKey: join(directory, "id_rsa.pub"),
  };
}

/**
 * Generate RSA PEM key pair for JWT signing (RS256, etc.).
 * Pure Node crypto — works on Windows, macOS, and Linux without OpenSSL CLI.
 */
export function runGenerateCerts(options: GenerateCertsOptions): GeneratedCertPaths {
  const root = options.root ?? process.cwd();
  const paths = generateJwtCertPaths(options.profile, root);
  const comment = options.comment ?? `ovenless-jwt-${options.profile}`;

  if (
    !options.force &&
    (existsSync(paths.privateKey) || existsSync(paths.publicKey))
  ) {
    throw new Error(
      `Certificate files already exist for profile "${options.profile}" at ${paths.directory}. Pass --force to overwrite.`,
    );
  }

  mkdirSync(paths.directory, { recursive: true });

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: options.modulusLength ?? 4096,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  writeFileSync(paths.privateKey, privateKey, { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.publicKey, publicKey, "utf8");

  console.log("");
  console.log(`  ▲ Ovenless certs  ·  ${options.profile}`);
  console.log(`  - Comment: ${comment}`);
  console.log(`  - Directory: cert/${options.profile}/`);
  console.log(`  - Private:   id_rsa (RSA ${options.modulusLength ?? 4096}, PEM PKCS#1)`);
  console.log(`  - Public:    id_rsa.pub`);
  console.log("");
  console.log("  Add cert/ to .gitignore — never commit private keys.");
  console.log("");

  return paths;
}
