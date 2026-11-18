# Mitsubishi Electric audit checkpoint — 2026-11-18

This is an incomplete checkpoint. No runtime data or pairing was added. The original official catalogue was re-downloaded from https://confort.mitsubishielectric.fr/sites/default/files/2026-04/RAC-MRSLIM-CATALOGUE-INTERACTIF-2026-V1.pdf; its SHA-256 matches the existing acceptance record, `378dc9c5c50a6529e3e09e65d43d6a52ff02523a6c71de12700ef289c7bf6bd1`. Rendered source pages 50, 76, 80 and 86 are pinned in the accompanying receipt. The 2026/27 document is a catalogue listing; actual current stock is not established.

The existing 25 outdoor / 45 indoor count **already includes** all six HR pairs on PDF p.50, despite the earlier coverage summary omitting HR from its description. The PDF table names these exact additional identities absent from runtime:

- PDF p.64: MSZ-EF18VGK2, with B/W/S finishes as documented in the family header; p.68: MSZ-LN18VG3, with R/B/V/W finishes. Both size 18 columns are multisplit-only, with no monosplit outdoor column. Their exact finish references remain to be individually source-reviewed for promotion.
- PDF p.76: MUZ-LN25VGHZ3, MUZ-LN35VGHZ3 and MUZ-LN50VGHZ3, paired by their size columns with already accepted MSZ-LN25/35/50VG3 indoor finishes. Their independent acceptance and runtime promotion remain undone.
- PDF p.80: MSZ-RW25VG2, MSZ-RW35VG2, MSZ-RW50VG2 and respectively MUZ-RW25VGHZ2, MUZ-RW35VGHZ2, MUZ-RW50VGHZ2. Their table readback, acceptance and promotion remain undone.
- PDF p.86: MSZ-RZ25VU, MSZ-RZ35VU, MSZ-RZ50VU and respectively MUZ-RZ25VUHZ, MUZ-RZ35VUHZ, MUZ-RZ50VUHZ. The table specifies R290, while the current importer explicitly accepts only R32 outdoors. The impact of importing R290 into the simulator's equipment selection has not been assessed; no R290 runtime profile was added.

The official range snapshot also names family suffix variants (e.g. AP-VG and RW-VG) that the French 2026/27 catalogue table does not individually resolve as current monosplit exact SKUs. Full family-level reconciliation across the range page is unfinished; the list above is not a completeness claim.

The combination booklet confirms at least two connected indoor units and names 12 models in its 2–4-head tables; its 5/6-head combination tables are digital-only and remain unpinned. Catalogue pages 110–116 publish minimum/maximum connected counts, but the official installation manuals and per-port rules have not yet been reviewed. No typed MXZ installation data has been added. In particular, the generic Daikin validator currently assumes Daikin manufacturer and its named reducer/class conventions, so adding Mitsubishi rules requires a separately reviewed representation and tests rather than repurposing those conventions.
