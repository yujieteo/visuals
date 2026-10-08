# Change the engine

The engine is `src/*.js`: pure modules with no DOM, storage, clock, randomness or network use. Each is a UMD file that attaches to `self.ConnesQFT` in the browser and is `require`d by the tests.

1. Change the module that owns the computation (see the table in [docs/architecture.md](../docs/architecture.md)). Keep every formula's source in its comment.
2. Add or update a test in `tests/engine.test.mjs` with the expected value and where it comes from (a textbook equation, a paper, or a hand calculation written up in [docs/verification.md](../docs/verification.md)).
3. If the value has an independent Python reference, update `reference/build_reference.py` and run it.
4. If the self-test list (`engine.selfTests`) covers it, keep it under a few milliseconds.
5. Run `python build.py` and the [Verify](verify.md) playbook.

Never present a schematic or toy value as a computed QED value: label it on the page and in the exports.
