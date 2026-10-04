import { ArtifactState } from '../models/artifacts.types';

/** 9771: 2B count + count × 4B (u16 artifactId + u8 nivel + u8 estrellas). */
const ENTRY_SIZE = 4;
const HEADER_SIZE = 2;

/**
 * 9771 — lista de artefactos poseídos (ArtifactList). Llega S→C en cada login
 * (push del servidor, ~RECV #114; ver docs/investigacion/artefactos.md).
 *
 * Body:
 *   @0  u16  count
 *   Luego count × registro de 4B:
 *     @0  u16  artifactId (items 7001..7250, claves de RelicsUpgrade)
 *     @2  u8   nivel (1..12)
 *     @3  u8   estrellas (0..5, 6 = Bendecido; RelicsEnhance)
 *
 * Ancla de la composición: 2 + count*4 == body.length en todas las
 * capturas (26 cuentas distintas), con niveles 1..9 y estrellas 0..6
 * observados; una cuenta nueva (2011305644) trae 39 artefactos todos
 * nv1/estrella0, lo que confirma el orden nivel→estrellas.
 */
export function parse9771(body: Buffer): ArtifactState[] | null {
  if (body.length < HEADER_SIZE) return null;
  const count = body.readUInt16LE(0);
  if (count > 300) return null;
  if (body.length !== HEADER_SIZE + count * ENTRY_SIZE) return null;

  const list: ArtifactState[] = [];
  let off = HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    const level = body[off + 2]!;
    const star = body[off + 3]!;
    if (level > 12 || star > 6) return null;
    list.push({ artifactId: body.readUInt16LE(off), level, star });
    off += ENTRY_SIZE;
  }
  return list;
}
