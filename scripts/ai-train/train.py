# Leert het waarde-netwerk van de Tokken-AI: stand -> kans dat de ploeg van de speler wint.
# python3 scripts/ai-train/train.py <uit.json> <data1.bin> [data2.bin ...]
import json, sys, time
import numpy as np

N_FEATURES = 56
HIDDEN = int(__import__('os').environ.get('HIDDEN', 48))
EPOCHS = int(__import__('os').environ.get('EPOCHS', 10))

out = sys.argv[1]
parts = [np.fromfile(p, dtype=np.float32).reshape(-1, N_FEATURES + 1) for p in sys.argv[2:]]
# per bestand de laatste 8% als validatie (rijen staan per spel, dus dit splitst grotendeels per spel)
tr, va = [], []
for d in parts:
    n = int(len(d) * 0.92)
    tr.append(d[:n]); va.append(d[n:])
tr = np.concatenate(tr); va = np.concatenate(va)
Xtr, ytr = tr[:, :N_FEATURES], tr[:, N_FEATURES]
Xva, yva = va[:, :N_FEATURES], va[:, N_FEATURES]
mean = Xtr.mean(0); std = Xtr.std(0) + 1e-3
Xtr = (Xtr - mean) / std; Xva = (Xva - mean) / std
print(f'train {len(Xtr)}  val {len(Xva)}  winrate {ytr.mean():.3f}', flush=True)

rng = np.random.default_rng(1)
W1 = rng.normal(0, np.sqrt(2 / N_FEATURES), (HIDDEN, N_FEATURES)).astype(np.float32)
b1 = np.zeros(HIDDEN, np.float32)
w2 = rng.normal(0, np.sqrt(1 / HIDDEN), HIDDEN).astype(np.float32)
b2 = np.float32(0)
params = [W1, b1, w2, np.array([b2], np.float32)]
m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]

def forward(X):
    H = X @ params[0].T + params[1]
    A = np.maximum(H, 0)
    z = A @ params[2] + params[3][0]
    return H, A, z

def loss(X, y):
    z = forward(X)[2]
    p = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
    eps = 1e-7
    return float(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps))), float(np.mean((p > .5) == (y > .5)))

base = -np.mean(yva * np.log(yva.mean()) + (1 - yva) * np.log(1 - yva.mean()))
print(f'basis-logloss (altijd gemiddelde) {base:.4f}', flush=True)
lr, B, t = 2e-3, 2048, 0
t0 = time.time()
for ep in range(EPOCHS):
    idx = rng.permutation(len(Xtr))
    for s in range(0, len(idx), B):
        j = idx[s:s + B]; X = Xtr[j]; y = ytr[j]
        H, A, z = forward(X)
        p = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
        dz = (p - y) / len(j)
        g_w2 = A.T @ dz; g_b2 = np.array([dz.sum()], np.float32)
        dA = np.outer(dz, params[2]) * (H > 0)
        g_W1 = dA.T @ X + 1e-5 * params[0]; g_b1 = dA.sum(0)
        grads = [g_W1, g_b1, g_w2, g_b2]
        t += 1
        for k in range(4):
            m[k] = 0.9 * m[k] + 0.1 * grads[k]
            v[k] = 0.999 * v[k] + 0.001 * grads[k] ** 2
            mh = m[k] / (1 - 0.9 ** t); vh = v[k] / (1 - 0.999 ** t)
            params[k] -= (lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32)
    if ep == EPOCHS - 3: lr /= 3
    l, a = loss(Xva, yva)
    print(f'epoch {ep + 1}: val logloss {l:.4f}  juist {a:.3f}  ({time.time() - t0:.0f}s)', flush=True)

json.dump({
    'mean': [round(float(x), 6) for x in mean], 'std': [round(float(x), 6) for x in std],
    'w1': [[round(float(x), 5) for x in row] for row in params[0]], 'b1': [round(float(x), 5) for x in params[1]],
    'w2': [round(float(x), 5) for x in params[2]], 'b2': round(float(params[3][0]), 5),
}, open(out, 'w'))
print('bewaard', out)
