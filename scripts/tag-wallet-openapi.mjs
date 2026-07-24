import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const targets = [
  path.join(root, "lib/api-spec/openapi.yaml"),
  path.join(root, "lib/api-spec/crm-openapi-section.yaml"),
];
const walletOperationIds = new Set([
  "getCrmGiftCards",
  "createCrmGiftCard",
  "lookupCrmGiftCard",
  "payWithCrmGiftCard",
  "getCrmGiftCard",
  "rechargeCrmGiftCard",
  "blockCrmGiftCard",
  "getCrmClientWallet",
  "addCrmWalletBalance",
  "payWithCrmWallet",
  "adjustCrmWallet",
]);
const tagLine = "phase51-wallet";
const tagDefinition = `  - name: ${tagLine}\n    description: Client wallet (monedero) and gift cards (tarjetas regalo)`;

function tagWalletOperations(source) {
  const lines = source.split("\n");
  let pending = false;
  let tagged = 0;
  for (let i = 0; i < lines.length; i++) {
    const operationMatch = lines[i].match(/^(\s*)operationId:\s*(\S+)\s*$/);
    if (operationMatch) {
      pending = walletOperationIds.has(operationMatch[2]);
      continue;
    }
    if (!pending) continue;
    const tagsMatch = lines[i].match(/^(\s*)tags:\s*\[(.*)\]\s*$/);
    if (!tagsMatch) continue;
    pending = false;
    if (tagsMatch[2].includes(tagLine)) continue;
    lines[i] = `${tagsMatch[1]}tags: [${tagsMatch[2]}, ${tagLine}]`;
    tagged++;
  }
  return { text: lines.join("\n"), tagged };
}

for (const file of targets) {
  const { text, tagged } = tagWalletOperations(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, text);
  console.log(`${path.relative(root, file)}: tagged ${tagged} operations`);
}

const specPath = targets[0];
let spec = fs.readFileSync(specPath, "utf8");
if (!spec.includes(`name: ${tagLine}`)) {
  spec = spec.replace(
    "  - name: crm\n    description: CRM clients, loyalty, gift cards, promotions and campaigns\n",
    `  - name: crm\n    description: CRM clients, loyalty, gift cards, promotions and campaigns\n${tagDefinition}\n`,
  );
  fs.writeFileSync(specPath, spec);
  console.log("Added phase51-wallet tag definition to openapi.yaml");
}
