'use strict';

const readline = require('readline');
const { parseProto1417 } = require('./proto1417-parser');

function printResult(result) {
  console.log('\nProto 1417 Parser');
  console.log('────────────────────────\n');

  if (result.error) {
    console.log(`ERROR: ${result.error}`);
    return;
  }

  if (result.header) {
    const h = result.header;

    console.log('HEADER');
    console.log(`  start              = ${h.start}`);
    console.log(
      `  timestamp          = ${h.timestamp.raw} (decimal LE: ${h.timestamp.decimalLE})`
    );
    console.log(`  timestampSeparator = ${h.timestampSeparator}`);
    console.log(`  separator          = ${h.separator}`);
    console.log(
      `  count              = ${h.count.raw} (decimal LE: ${h.count.decimalLE})`
    );
    console.log();
  } else {
    console.log('NO HEADER — items only');
    console.log();
  }

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    const num = String(i + 1).padStart(2, ' ');

    console.log(`TRAJE #${num}`);

    console.log(
      `  id=${item.id}  ` +
      `grade=${item.grade}  ` +
      `gem1=${item.gemLevel1}  ` +
      `gem2=${item.gemLevel2}  ` +
      `gem3=${item.gemLevel3}  ` +
      `stealth=${item.stealthLevel1}`
    );

    console.log(
      `  gemId1=${item.gemId1}  ` +
      `gemId2=${item.gemId2}  ` +
      `gemId3=${item.gemId3}  ` +
      `stealthId=${item.stealthId1}`
    );

    console.log(
      `  index=${item.index}  ` +
      `end=${item.end}`
    );

    if (item.raw) {
      console.log(`  raw=${item.raw}`);
    }

    if (item.offset !== undefined) {
      console.log(`  offset=${item.offset}`);
    }

    console.log();
  }

  console.log('VALIDATION');
  console.log(`  Items parsed = ${result.items.length}`);

  if (result.header) {
    console.log(`  Items declared = ${result.header.count.decimalLE}`);

    if (
      result.items.length ===
      result.header.count.decimalLE
    ) {
      console.log('  Count check   = PASS');
    } else {
      console.log('  Count check   = FAIL');
    }
  }

  console.log(`  Remaining = ${result.remaining || '(empty)'}`);

  if (!result.remaining) {
    console.log('  Remaining check = PASS');
  } else {
    console.log('  Remaining check = FAIL');
  }

  console.log('\n────────────────────────');
}

function cleanHex(input) {
  return input
    .replace(/\/\/.*$/gm, '') // elimina comentarios //
    .replace(/\s+/g, '')      // elimina espacios/saltos de línea
    .trim();
}

async function main() {
  console.log('=== Protocol 1417 — Interactive Parser ===\n');

  console.log('Pegá el HEX completo.');
  console.log('Podés pegarlo en varias líneas.');
  console.log('También acepta espacios y comentarios //.');
  console.log('Cuando termines, escribí una línea que contenga solamente:');
  console.log('END\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const lines = [];

  rl.on('line', (line) => {
    if (line.trim().toUpperCase() === 'END') {
      rl.close();
      return;
    }

    lines.push(line);
  });

  await new Promise((resolve) => rl.on('close', resolve));

  const input = lines.join('\n');
  const hex = cleanHex(input);

  console.log('\nHEX recibido:');
  console.log(`  ${hex.length / 2} bytes`);
  console.log(`  ${hex.length} caracteres hex`);

  if (!hex) {
    console.log('\nNo ingresaste ningún HEX.');
    return;
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    console.log('\nERROR: el input contiene caracteres que no son HEX.');
    return;
  }

  if (hex.length % 2 !== 0) {
    console.log('\nERROR: el HEX tiene una cantidad impar de caracteres.');
    return;
  }

  console.log('\nParseando...\n');

  try {
    const result = parseProto1417(hex);

    printResult(result);

    if (result.error) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.log('\nERROR DEL PARSER');
    console.log(error.message);
    process.exitCode = 1;
  }
}

main();