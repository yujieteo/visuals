"""Independent numerical checks of the JavaScript detector and model, in Python's standard library only.

The noncentral chi-square tails are computed here a different way (direct quadrature of the Rician and
noncentral chi-square densities with a Bessel series), then compared with the page's own functions run in Node.
The preset's TOON block from the specification is parsed and compared with data/preset.json.
"""
import json
import math
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def node(expr):
    code = f"const N=require('./src/numerics.js'),D=require('./src/detector.js'),M=require('./src/model.js');process.stdout.write(JSON.stringify({expr}))"
    return json.loads(subprocess.run(["node", "-e", code], cwd=HERE, capture_output=True, text=True, check=True).stdout)


def bessel_i(nu, x):
    """Modified Bessel I_nu(x) * exp(-x) by its power series (x up to a few hundred is enough here)."""
    s, k = 0.0, 0
    log_half = math.log(x / 2) if x > 0 else -math.inf
    terms = []
    while True:
        lt = (2 * k + nu) * log_half - math.lgamma(k + 1) - math.lgamma(k + nu + 1) - x
        terms.append(lt)
        if k > x and lt < max(terms) - 40:
            break
        k += 1
    m = max(terms)
    return math.exp(m) * math.fsum(math.exp(t - m) for t in terms)


def ncx2_sf(x, dof, lam, upper=None, n=6000):
    """P(X > x) by Simpson quadrature of the noncentral chi-square density from x to far in the tail."""
    nu = dof / 2 - 1
    hi = upper or (dof + lam + 60 * math.sqrt(2 * (dof + 2 * lam)) + 200)

    def pdf(y):
        if y <= 0:
            return 0.0
        if lam == 0:
            return math.exp((dof / 2 - 1) * math.log(y) - y / 2 - (dof / 2) * math.log(2) - math.lgamma(dof / 2))
        z = math.sqrt(lam * y)
        return 0.5 * math.exp(-(y + lam) / 2 + z + (nu / 2) * math.log(y / lam)) * bessel_i(nu, z)

    h = (hi - x) / n
    s = pdf(x) + pdf(hi)
    s += 4 * math.fsum(pdf(x + (2 * i - 1) * h) for i in range(1, n // 2 + 1))
    s += 2 * math.fsum(pdf(x + 2 * i * h) for i in range(1, n // 2))
    return s * h / 3


class Independent(unittest.TestCase):
    def test_marcum_q1_against_quadrature(self):
        cases = [(13.8155, 1.0), (13.8155, 20.0), (4.6, 3.0), (13.8155, 60.0)]
        js = node("[" + ",".join(f"N.ncx2Tail({2 * e},2,{2 * r}).sf" for e, r in cases) + "]")
        for (eta, rho), got in zip(cases, js):
            ref = ncx2_sf(2 * eta, 2, 2 * rho)
            self.assertAlmostEqual(got / ref, 1, delta=2e-6, msg=f"eta={eta}, rho={rho}: {got} vs {ref}")

    def test_noncoherent_tail_against_quadrature(self):
        cases = [(16, 2 * 16 * 0.5, 40.0), (8, 0.0, 30.0), (64, 2 * 64 * 0.2, 218.9)]
        js = node("[" + ",".join(f"N.ncx2Tail({x},{2 * k},{lam}).sf" for k, lam, x in cases) + "]")
        for (k, lam, x), got in zip(cases, js):
            ref = ncx2_sf(x, 2 * k, lam)
            self.assertAlmostEqual(got / ref, 1, delta=2e-5, msg=f"N={k}, lambda={lam}, x={x}: {got} vs {ref}")

    def test_small_tail_pfa(self):
        # Noise only, 2N dof: the tail at the noncoherent threshold equals Pfa = 1e-6.
        eta = node("D.threshold('noncoherent',8,1e-6).eta")
        self.assertAlmostEqual(ncx2_sf(2 * eta, 16, 0.0) / 1e-6, 1, delta=1e-5)

    def test_swerling_averages_against_quadrature(self):
        # Swerling 3, coherent single cell: average Q1 over gamma(2, 1/2) by independent Simpson in x.
        eta, rho = -math.log(1e-6), 50.0
        got = node(f"D.pd({{integration:'coherent',pulses:1,pfa:1e-6,swerling:3}},{rho}).pd")
        js_q1 = node("Array.from({length:801},(_,i)=>N.ncx2Tail(%r,2,2*%r*(i*0.03)).sf)" % (2 * eta, rho))
        xs = [i * 0.03 for i in range(801)]
        f = [4 * x * math.exp(-2 * x) * q for x, q in zip(xs, js_q1)]
        ref = 0.03 / 3 * (f[0] + f[-1] + 4 * sum(f[1:-1:2]) + 2 * sum(f[2:-1:2]))
        self.assertAlmostEqual(got, ref, delta=1e-6)

    def test_reference_equation_values(self):
        lam = 299792458 / 10e9
        k = 1.380649e-23
        snr = 1e6 * 1e4 * 1e4 * lam ** 2 * 0.5 * 1e-6 / ((4 * math.pi) ** 3 * k * 300 * 1e5 ** 4 * 10 ** 0.3)
        self.assertAlmostEqual(10 * math.log10(snr), 14.3777728, delta=1e-7)
        rmax = (1e6 * 1e4 * 1e4 * lam ** 2 * 0.1 * 10e-6 / ((4 * math.pi) ** 3 * k * 290 * 10 ** 0.3 * 10 ** 0.6)) ** 0.25
        self.assertAlmostEqual(rmax, 194259.664, delta=1e-3)


class Preset(unittest.TestCase):
    def test_toon_block_matches_the_tables(self):
        p = json.loads((HERE / "data" / "preset.json").read_text(encoding="utf-8"))
        tables, current, header = {}, None, None
        for line in p["toon"].splitlines():
            if not line.startswith(" ") and line.endswith(":"):
                name = line.split("[")[0].split("{")[0].rstrip(":")
                header = line[line.index("{") + 1:line.index("}")].split(",") if "{" in line else None
                current = tables.setdefault(name, [] if header else {})
            elif header:
                vals = line.strip().split(",")
                current.append({k: (v if not v.replace(".", "").replace("-", "").isdigit() else float(v)) for k, v in zip(header, vals)})
            else:
                k, v = line.strip().split(": ")
                current[k] = v
        self.assertEqual(float(tables["scene"]["duration_s"]), p["scene"]["duration_s"])
        self.assertEqual(int(tables["scene"]["seed"]), p["scene"]["seed"])
        for kind in ["radars", "targets"]:
            self.assertEqual(len(tables[kind]), len(p[kind]))
            for row, obj in zip(tables[kind], p[kind]):
                for k, v in row.items():
                    self.assertEqual(obj[k], v, f"{kind} {obj['id']} {k}")


if __name__ == "__main__":
    unittest.main()
