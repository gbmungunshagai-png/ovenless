import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OvenlessProfile } from "../config.ts";
import { generateJwtCertPaths } from "../cli/generate-certs.ts";

export interface JwtKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  profile: OvenlessProfile;
  directory: string;
}

export function loadJwtKeys(
  profile: OvenlessProfile,
  root = process.cwd(),
  certDir = "cert",
): JwtKeyPair {
  const directory = join(root, certDir, profile);
  const privatePath = join(directory, "id_rsa");
  const publicPath = join(directory, "id_rsa.pub");

  if (!existsSync(privatePath) || !existsSync(publicPath)) {
    const expected = generateJwtCertPaths(profile, root);
    throw new Error(
      `JWT keys not found for profile "${profile}" at ${expected.directory}.\n` +
        `Run: ovenless certs --profile ${profile}`,
    );
  }

  return {
    privateKeyPem: readFileSync(privatePath, "utf8"),
    publicKeyPem: readFileSync(publicPath, "utf8"),
    profile,
    directory,
  };
}

export function assertJwtKeysExist(
  profile: OvenlessProfile,
  root = process.cwd(),
  certDir = "cert",
): void {
  loadJwtKeys(profile, root, certDir);
}
