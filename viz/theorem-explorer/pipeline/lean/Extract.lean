/-
Theorem Explorer: the mathlib4 adapter's formal extraction (extraction tool version "lean-extract/1").

Run from a mathlib4 checkout at the pinned commit, after `lake exe cache get`:

    lake env lean --run Extract.lean <out.jsonl> <shard> <shards> <mathlib-commit>

It imports `Mathlib`, takes every constant whose module is in `Mathlib.*`, keeps the ones whose name hash is
`shard` modulo `shards`, and writes one JSON object per constant. A constant that an exclusion rule
removes is still written, with its rule in `x`, so every extracted record is accounted for.

Fields: n name, m module, k kind (theorem, def, structure, class, inductive, axiom, opaque), x exclusion rule or
absent, sig the pretty-printed signature, concl the conclusion after the binders, hyps the proposition binders
(text), nd data binders, ncl typeclass binders, cls their class names, tdeps the constants the type uses (signature
references), vdeps the constants the value uses that the type does not (proof references), ax the transitive axioms
(type and value), pu the proof term's distinct subterms (structurally equal subterms count once), pt its size with
every occurrence counted, rng the declaration range (line, column, end line, end column; lines from 1), doc the
docstring, err an error while pretty-printing.
-/
import Lean
open Lean Meta

/-- Why a Mathlib constant is not a catalogue record, or `none` when it is one. -/
def exclusion (env : Environment) (n : Name) (ci : ConstantInfo) : Option String :=
  if n.isInternalDetail then some "internal-name"
  else if isAuxRecursor env n || isNoConfusion env n then some "auxiliary-recursor"
  else if ci matches .recInfo _ then some "recursor"
  else if ci matches .ctorInfo _ then some "constructor"
  else if ci matches .quotInfo _ then some "quotient-primitive"
  else if Meta.isMatcherCore env n then some "matcher"
  else if (env.getProjectionFnInfo? n).isSome then some "structure-field"
  else if Meta.isInstanceCore env n then some "instance"
  else if Linter.isDeprecated env n then some "deprecated-alias"
  else match n with
    | .str _ s =>
      if s == "eq_def" || s == "eq_unfold" || (s.startsWith "eq_" && (s.drop 3).all Char.isDigit) then
        some "equation-lemma"
      else if s.startsWith "proof_" || s.startsWith "_" then some "internal-name"
      else none
    | _ => none

def kindOf (env : Environment) (n : Name) (ci : ConstantInfo) : String :=
  match ci with
  | .thmInfo _ => "theorem"
  | .axiomInfo _ => "axiom"
  | .opaqueInfo _ => "opaque"
  | .inductInfo _ => if isClass env n then "class" else if isStructure env n then "structure" else "inductive"
  | .defnInfo _ => if isClass env n then "class" else "def"
  | _ => "other"

/-- The value of a definition, theorem or opaque constant. `ConstantInfo.value?` leaves out theorem proofs. -/
def valueOf : ConstantInfo → Option Expr
  | .thmInfo v => some v.value
  | .defnInfo v => some v.value
  | .opaqueInfo v => some v.value
  | _ => none

/-- Every constant that `ci` uses: its type, its value, and an inductive type's constructors, as Lean's
`collectAxioms` visits them. -/
def usedConstants (ci : ConstantInfo) : Array Name := Id.run do
  let mut s := ci.type.getUsedConstantsAsSet
  if let some v := valueOf ci then
    for c in v.getUsedConstants do s := s.insert c
  if let .inductInfo v := ci then
    for c in v.ctors do s := s.insert c
  return s.toArray

/-- The transitive axioms of every constant, memoised as a bit set over the axioms met so far. -/
structure AxState where
  memo : Std.HashMap Name UInt64 := {}
  bits : Array Name := #[]

def axiomBits (env : Environment) (root : Name) : StateT AxState IO UInt64 := do
  if let some b := (← get).memo[root]? then return b
  -- iterative post-order: a node is expanded once (visited), and finished when all its children are
  let mut visited : Std.HashSet Name := {}
  let mut stack : Array (Name × Option (Array Name)) := #[(root, none)]
  while h : stack.size > 0 do
    let (n, kids?) := stack[stack.size - 1]
    stack := stack.pop
    if (← get).memo.contains n then continue
    match kids? with
    | some kids =>
      let mut b : UInt64 := 0
      if let some (.axiomInfo _) := env.find? n then
        let st ← get
        let i ← match st.bits.findIdx? (· == n) with
          | some i => pure i
          | none => do set { st with bits := st.bits.push n }; pure st.bits.size
        b := b ||| ((1 : UInt64) <<< i.toUInt64)
      for d in kids do
        b := b ||| ((← get).memo[d]?.getD 0)
      modify fun s => { s with memo := s.memo.insert n b }
    | none =>
      -- a node met again before it finishes lies on a cycle: skip it
      if visited.contains n then continue
      visited := visited.insert n
      let some ci := env.find? n | modify fun s => { s with memo := s.memo.insert n 0 }; continue
      let kids := usedConstants ci
      stack := stack.push (n, some kids)
      for d in kids do
        if !(← get).memo.contains d && !visited.contains d then stack := stack.push (d, none)
  return (← get).memo[root]?.getD 0

/-- The distinct subterms of `e` (structural equality) and its size with every occurrence counted. -/
def termSizes (e : Expr) : Nat × Nat := Id.run do
  let mut tree : Std.HashMap Expr Nat := {}
  let mut stack : Array (Expr × Bool) := #[(e, false)]
  while h : stack.size > 0 do
    let (x, expanded) := stack[stack.size - 1]
    stack := stack.pop
    if tree.contains x then continue
    let kids : List Expr := match x with
      | .app f a => [f, a]
      | .lam _ t b _ => [t, b]
      | .forallE _ t b _ => [t, b]
      | .letE _ t v b _ => [t, v, b]
      | .mdata _ b => [b]
      | .proj _ _ b => [b]
      | _ => []
    if expanded then
      tree := tree.insert x (1 + kids.foldl (fun acc k => acc + tree.getD k 0) 0)
    else
      stack := stack.push (x, true)
      for k in kids do
        if !tree.contains k then stack := stack.push (k, false)
  return (tree.size, tree.getD e 0)

def jsonNames (xs : Array Name) : Json := Json.arr (xs.map fun n => Json.str n.toString)

def pp (e : Expr) : MetaM String := do
  return toString (← ppExpr e)

/-- The signature, conclusion and binder classification of one constant. -/
def describe (n : Name) (ty : Expr) : MetaM (List (String × Json)) := do
  let sig := (← PrettyPrinter.ppSignature n).fmt.pretty 100
  forallTelescope ty fun xs body => do
    let mut hyps : Array Json := #[]
    let mut nd : Nat := 0
    let mut cls : Array Name := #[]
    for x in xs do
      let d ← x.fvarId!.getDecl
      let t := d.type
      if d.binderInfo.isInstImplicit || (← isClass? t).isSome then
        cls := cls.push (t.getAppFn.constName?.getD `_)
      else if ← isProp t then
        hyps := hyps.push (Json.str (← pp t))
      else
        nd := nd + 1
    return [("sig", Json.str sig), ("concl", Json.str (← pp body)), ("hyps", Json.arr hyps),
      ("nd", toJson nd), ("ncl", toJson cls.size), ("cls", jsonNames cls)]

unsafe def main (args : List String) : IO UInt32 := do
  let [out, shardS, shardsS, commit] := args
    | IO.eprintln "usage: lean --run Extract.lean <out.jsonl> <shard> <shards> <mathlib-commit>"; return 2
  let shard := shardS.toNat!
  let shards := shardsS.toNat!
  initSearchPath (← findSysroot)
  enableInitializersExecution
  let t0 ← IO.monoMsNow
  let env ← importModules #[{ module := `Mathlib }] {} (trustLevel := 1024) (loadExts := true)
  IO.eprintln s!"imported in {(← IO.monoMsNow) - t0} ms"
  let mods := env.header.moduleNames
  let mut names : Array Name := #[]
  for (n, _) in env.constants.map₁.toList do
    if let some idx := env.getModuleIdxFor? n then
      if (`Mathlib).isPrefixOf mods[idx.toNat]! then names := names.push n
  let h ← IO.FS.Handle.mk out .write
  h.putStrLn (Json.compress (Json.mkObj [("header", Json.mkObj [
    ("tool", Json.str "lean-extract/1"), ("lean", Json.str Lean.versionString), ("mathlib", Json.str commit),
    ("constants", toJson names.size), ("shard", toJson shard), ("shards", toJson shards)])]))
  let opts : Options := ({} : Options).setBool `pp.proofs false
  let ctx : Core.Context := { fileName := "<extract>", fileMap := default, maxHeartbeats := 0, maxRecDepth := 4096, options := opts }
  let mut axs : AxState := {}
  let mut i := 0
  for n in names do
    i := i + 1
    if (hash n).toNat % shards != shard then continue
    let some ci := env.find? n | continue
    let modName := mods[(env.getModuleIdxFor? n).get!.toNat]!
    let mut fields : List (String × Json) := [("n", Json.str n.toString), ("m", Json.str modName.toString),
      ("k", Json.str (kindOf env n ci))]
    match exclusion env n ci with
    | some why => fields := fields ++ [("x", Json.str why)]
    | none =>
      let tdeps := ci.type.getUsedConstantsAsSet
      let vdeps := ((valueOf ci).map (·.getUsedConstants)).getD #[] |>.filter (!tdeps.contains ·)
      let (bits, axs') ← (axiomBits env n).run axs
      axs := axs'
      let axNames := (List.range axs.bits.size).filterMap fun j =>
        if bits &&& ((1 : UInt64) <<< j.toUInt64) != 0 then axs.bits[j]? else none
      fields := fields ++ [("tdeps", jsonNames (tdeps.toArray.qsort (·.toString < ·.toString))),
        ("vdeps", jsonNames (vdeps.qsort (·.toString < ·.toString))), ("ax", jsonNames axNames.toArray)]
      if let .thmInfo tv := ci then
        let (u, t) := termSizes tv.value
        fields := fields ++ [("pu", toJson u), ("pt", toJson t)]
      let st : Core.State := { env }
      try
        let (desc, _) ← ((describe n ci.type).run' {} {}).toIO ctx st
        fields := fields ++ desc
        let (rng, _) ← (findDeclarationRanges? n : CoreM _).toIO ctx st
        if let some r := rng then
          fields := fields ++ [("rng", Json.arr #[toJson r.range.pos.line, toJson r.range.pos.column,
            toJson r.range.endPos.line, toJson r.range.endPos.column])]
      catch e =>
        fields := fields ++ [("err", Json.str (toString e))]
      if let some doc ← findDocString? env n then fields := fields ++ [("doc", Json.str doc)]
    h.putStrLn (Json.compress (Json.mkObj fields))
    if i % 20000 < shards then IO.eprintln s!"{i}/{names.size} at {(← IO.monoMsNow) - t0} ms"
  IO.eprintln s!"done in {(← IO.monoMsNow) - t0} ms"
  return 0
