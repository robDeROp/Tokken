# Zet getrainde gewichten in lib/ai-weights.ts. python3 scripts/ai-train/export.py <net.json> "<beschrijving>"
import json, sys
net = json.load(open(sys.argv[1]))
desc = sys.argv[2] if len(sys.argv) > 2 else ''
with open('lib/ai-weights.ts', 'w') as f:
    f.write('// Gegenereerd door scripts/ai-train/export.py — niet met de hand aanpassen.\n')
    f.write(f'// {desc}\n')
    f.write("import type { Net } from './ai.ts';\n\n")
    f.write('export const AI_NET: Net | null = ' + json.dumps(net, separators=(',', ':')) + ';\n')
print('lib/ai-weights.ts', len(open('lib/ai-weights.ts').read()), 'tekens')
