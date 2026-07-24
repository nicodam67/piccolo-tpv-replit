import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface BackupArtifact {
  formatVersion: string;
  appVersion: string;
  backupId: string;
  createdAt: string;
  iv: string;
  ciphertext: string;
  checksum: string;
}

export interface BackupDestination {
  id: string;
  destType: string;
  config: Record<string, unknown>;
}

function artifactJson(artifact: BackupArtifact): string {
  return JSON.stringify(artifact);
}

function allowedLocalPath(basePath: string): string {
  const allowed = (process.env.BACKUP_LOCAL_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  const resolved = path.resolve(basePath);
  if (allowed.length === 0 || !allowed.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error("Destino local fuera de BACKUP_LOCAL_ROOTS");
  }
  return resolved;
}

async function localUpload(destination: BackupDestination, artifact: BackupArtifact): Promise<string> {
  const base = allowedLocalPath(String(destination.config.basePath ?? ""));
  await mkdir(base, { recursive: true, mode: 0o700 });
  const canonical = await realpath(base);
  if (canonical !== base) throw new Error("El destino local contiene enlaces no permitidos");
  const name = `${artifact.backupId}.piccolo-backup.json`;
  const target = path.join(base, name);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, artifactJson(artifact), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  return name;
}

function s3Client(config: Record<string, unknown>): S3Client {
  const endpoint = String(config.endpoint ?? "");
  const region = String(config.region ?? "");
  const accessKeyId = String(config.accessKeyId ?? "");
  const secretAccessKey = String(config.secretAccessKey ?? "");
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !config.bucket) {
    throw new Error("Configuración S3 incompleta");
  }
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: config.forcePathStyle !== false,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function s3Key(destination: BackupDestination, artifact: BackupArtifact): string {
  const prefix = String(destination.config.prefix ?? "piccolo").replace(/^\/+|\/+$/g, "");
  const restaurant = process.env.RESTAURANT_ID ?? "restaurant";
  return `${prefix}/${restaurant}/${artifact.createdAt.slice(0, 7)}/${artifact.backupId}.piccolo-backup.json`;
}

export async function uploadBackupArtifact(
  destination: BackupDestination,
  artifact: BackupArtifact,
): Promise<string> {
  if (["local", "local_mount", "nas"].includes(destination.destType)) {
    return localUpload(destination, artifact);
  }
  if (destination.destType === "s3") {
    const client = s3Client(destination.config);
    const Key = s3Key(destination, artifact);
    await client.send(new PutObjectCommand({
      Bucket: String(destination.config.bucket),
      Key,
      Body: artifactJson(artifact),
      ContentType: "application/json",
      Metadata: { checksum: artifact.checksum },
      ServerSideEncryption: destination.config.sse === "AES256" ? "AES256" : undefined,
    }));
    return Key;
  }
  throw new Error(`Tipo de destino no soportado: ${destination.destType}`);
}

export async function downloadBackupArtifact(
  destination: BackupDestination,
  reference: string,
): Promise<BackupArtifact> {
  if (["local", "local_mount", "nas"].includes(destination.destType)) {
    const base = allowedLocalPath(String(destination.config.basePath ?? ""));
    const target = path.resolve(base, reference);
    if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Referencia local no válida");
    return JSON.parse(await readFile(target, "utf8")) as BackupArtifact;
  }
  if (destination.destType === "s3") {
    const response = await s3Client(destination.config).send(new GetObjectCommand({
      Bucket: String(destination.config.bucket),
      Key: reference,
    }));
    if (!response.Body) throw new Error("Artefacto S3 vacío");
    return JSON.parse(await response.Body.transformToString()) as BackupArtifact;
  }
  throw new Error(`Tipo de destino no soportado: ${destination.destType}`);
}

export async function verifyBackupArtifact(
  destination: BackupDestination,
  reference: string,
  checksum: string,
): Promise<boolean> {
  if (destination.destType === "s3") {
    const head = await s3Client(destination.config).send(new HeadObjectCommand({
      Bucket: String(destination.config.bucket),
      Key: reference,
    }));
    if (head.Metadata?.checksum !== checksum) return false;
  } else {
    const base = allowedLocalPath(String(destination.config.basePath ?? ""));
    const info = await stat(path.resolve(base, reference));
    if (!info.isFile() || info.size === 0) return false;
  }
  const artifact = await downloadBackupArtifact(destination, reference);
  return artifact.checksum === checksum;
}

export async function purgeBackupArtifact(
  destination: BackupDestination,
  reference: string,
): Promise<void> {
  if (destination.destType === "s3") {
    await s3Client(destination.config).send(new DeleteObjectCommand({
      Bucket: String(destination.config.bucket),
      Key: reference,
    }));
    return;
  }
  const base = allowedLocalPath(String(destination.config.basePath ?? ""));
  const target = path.resolve(base, reference);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Referencia local no válida");
  await rm(target, { force: true });
}
