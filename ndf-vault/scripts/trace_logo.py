import sys, numpy as np, potrace
from PIL import Image
src, out_ts = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
a = np.asarray(im)[..., 3]
ys, xs = np.where(a > 10)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
a = a[y0:y1, x0:x1]
H, W = a.shape
# find the horizontal gap between "NDF5" and "PRODUCTIONS"
rows = (a > 128).sum(1)
gap = [y for y in range(int(H*0.5), int(H*0.9)) if rows[y] == 0]
print('size', W, H, 'gap rows', gap[:1], gap[-1:] if gap else None)
split = (gap[0] + gap[-1]) // 2 if gap else int(H * 0.69)

def trace(mask):
    bm = potrace.Bitmap(~mask)
    pl = bm.trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.4)
    parts = []
    for c in pl:
        s = c.start_point
        parts.append(f"M{s.x:.1f} {s.y:.1f}")
        for seg in c.segments:
            if seg.is_corner:
                parts.append(f"L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}")
            else:
                parts.append(f"C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}")
        parts.append("Z")
    return "".join(parts)

full = a > 128
mark = full[:split]
my = np.where(mark.any(1))[0]; mark = mark[my.min():my.max()+1]
d_full, d_mark = trace(full), trace(mark)
open(out_ts, 'w').write(
  "// Generated from the NDF5 Productions logo (ndf5.com). Do not edit by hand.\n"
  f"export const NDF5_FULL = {{ w: {W}, h: {H}, d: \"{d_full}\" }};\n"
  f"export const NDF5_MARK = {{ w: {mark.shape[1]}, h: {mark.shape[0]}, d: \"{d_mark}\" }};\n")
print('paths', len(d_full), len(d_mark), 'mark', mark.shape)
