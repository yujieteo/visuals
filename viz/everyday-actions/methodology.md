# Everyday actions: methodology

This page plots everyday activities against measured properties of those
activities. It separates four kinds of content, and every file says which kind
it holds:

1. **Measured values**, as published: `drm_table1.csv`.
2. **Transformations of measured values**: survey-weighted ATUS estimates
   (`atus_estimates.csv`, from `derive_atus.py`) and DRM net affect
   (positive − negative, the paper's own definition).
3. **Mappings between taxonomies**: `crosswalk.csv`.
4. **Interpretations**: the ordinal codes in `decisions.csv` and the
   placeholder rows of the reconsideration ledger.

No overall score, ranking or weighted index is computed.

## Datasets found and used

| Source | What it measures | Population | n | Year | How it was obtained |
| --- | --- | --- | --- | --- | --- |
| Kahneman, Krueger, Schkade, Schwarz & Stone, *Science* 306:1776 (2004), Table 1 | Proportion reporting each of 16 activities; mean hours per day; mean 0–6 ratings of positive affect, negative affect, competent, impatient, tired | Employed women who worked on the reconstructed day (convenience sample) | 909 | 2004 | Transcribed from the published PDF |
| American Time Use Survey microdata, 2014–2016 (BLS) | Share engaging in an activity on an average day; minutes among those engaging | U.S. civilian noninstitutional population 15+ | 32,990 | 2014–2016 | Recomputed from the BLS activity-summary, respondent and ATUS-CPS files ([CRAN `atus` 0.2](https://github.com/cran/atus), commit `1049d1d`) with weight TUFNWGTP |

**Check against published BLS figures.** Run on 2015 only, `derive_atus.py`
gives TV = 0.7985 × 208.8 min = 2.78 h/day and socializing = 0.3808 × 106.9 min
= 40.7 min/day. The BLS 2015 release reports 2.8 h and 41 min.

### Found but not used

- **ATUS Well-Being Module (2010, 2012, 2013, 2021).** It has 0–6 ratings of
  happy, meaningful, sad, stressed, tired and pain for three random activities
  per respondent, across a national sample. It is the right source for meaning,
  stress and happiness axes. The network policy of the environment that built
  this page blocked bls.gov and every mirror of the module files. Its values
  were not retyped from secondary summaries, so no meaning or stress axis is
  shown. Adding the module is the obvious next step.
- **Princeton Affect and Time Survey (Krueger et al., 2009, "National Time
  Accounting").** It has a U-index and ratings by activity for about 4,000 U.S.
  adults. It was not retrievable from a primary copy for the same reason.
- **White & Dolan (2009), "Accounting for the richness of daily activities".**
  It has pleasure and reward by activity from a DRM with thoughts. It was not
  retrievable.

## Axes offered, and why only these

A pair of axes is offered only when at least eight activities have both values.

| View | Same population? | Points |
| --- | --- | --- |
| DRM share reporting × DRM positive affect (default) | yes | 16 |
| DRM negative, tired, impatient, competent or hours × DRM positive affect | yes | 16 |
| ATUS participation × ATUS minutes when done | yes | 22 |
| ATUS participation or minutes × any DRM rating | **no**, flagged on the page | 14 |

The default pairs frequency with experienced affect, both from one study. It is
the most defensible frequency × enjoyment graph available: both coordinates of
every point come from the same 909 people.

## Crosswalk

`crosswalk.csv` keeps the DRM label, the ATUS tier codes and label, and a match
grade:

- **close**: same construct, apart from ATUS recording only the primary activity.
- **partial**: different constructs. These are drawn hollow and can be hidden.
- **none**: no counterpart (intimate relations, napping).
- **atus-only**: no DRM counterpart.

As a check, ATUS was restricted to employed women 18+ who worked on a weekday
diary day, the DRM sample definition. Where the constructs match, the surveys
agree:

| Activity | DRM | ATUS (comparable) | Grade |
| --- | --- | --- | --- |
| Commuting | 0.87 | 0.86 | close |
| Eating | 0.94 | 0.94 | close |
| Preparing food | 0.62 | 0.64 | close |
| Exercising | 0.16 | 0.18 | close |
| Watching TV | 0.75 | 0.70 | close |
| Childcare | 0.36 | 0.30 | close |
| Socializing | 0.65 | 0.32 | partial |
| Relaxing | 0.77 | 0.19 | partial |
| Phone | 0.61 | 0.13 | partial |
| Computer | 0.47 | 0.12 | partial |

The partial matches diverge because the DRM counted every activity ticked for
an episode, while ATUS codes one primary activity.

## Limitations

- The DRM sample is small, female, employed and describes a working day. Its
  affect ratings are not national averages.
- Pairing ATUS frequency with DRM affect places one population's habits against
  another population's feelings, measured 10+ years apart.
- DRM "mean hours" averages over all respondents, including those who did not
  do the activity. ATUS "minutes when done" averages only over those who did.
  They are different quantities and are never placed on the same axis.
- Scales are left as published (0–6 ratings, proportions, minutes). Nothing is
  rescaled to 0–100.
- Median reference lines are medians of the points on screen, not population
  medians.
- Population averages describe groups. They are not advice for any individual.

## Decision charts (interpretation)

`decisions.csv` holds 100 common actions with authored codes on 1–5 scales:

- **Reversibility**: 1 permanent · 2 years to undo · 3 costly to undo ·
  4 small residue · 5 fully undoable.
- **Time sensitivity**: 1 same value any time this year · 2 months ·
  3 weeks · 4 days · 5 window closing now.
- **Downside** and **upside**: 1 minutes or brief awkwardness · 2 weeks ·
  3 months · 4 years · 5 lasting.
- **Information gained from doing it once**: 1 nothing new · 2 about the
  task · 3 about your own preferences · 4 about other people's responses ·
  5 resolves a major uncertainty.
- **Frequency tier** (daily … rare): also authored.

Where an action falls under an ATUS category, the page shows that category's
national participation rate as context only.

Fourteen actions link to experiments that measured how people misjudge them.
All citations are in `evidence.json`, and only abstract-level findings are
quoted:

| Study | Used for |
| --- | --- |
| Liu et al. (2023) | reaching out |
| Kumar & Epley (2018) | gratitude |
| Boothby & Bohns (2021) | compliments |
| Epley & Schroeder (2014) | talking to strangers |
| Kardas, Kumar & Epley (2022) | deeper conversation |
| Levitt (2021) | quitting and ending relationships |
| Mark, Gudith & Klocke (2008) | interruptions |
| Gilbert & Ebert (2002) | reversible choices reduce satisfaction, a counterweight |

The regret framing rests on Gilovich & Medvec (1995) and the Richardson &
Gilovich (2023) replication.

## Reconsideration ledger

No population data measures how long people spend reconsidering undone tasks.
The ledger is a personal instrument:

- Hours reconsidering = times considered × minutes each ÷ 60.
- Placement is by focus required (1–5) and time to do the task (log scale).

The seed rows are illustrative placeholders, and edits stay in the viewer's
browser. Supporting research: Masicampo & Baumeister (2011), on intrusion from
unfinished goals and relief from plan making; Killingsworth & Gilbert (2010),
on mind-wandering in 46.9% of samples.

## Rebuilding

```sh
# optional: recompute ATUS estimates (needs the cran/atus checkout, pandas, rdata)
python derive_atus.py /path/to/atus > atus_estimates.csv
# regenerate data.csv and sources.json, and re-embed data in index.html
python build.py
```

## Primary sources

- Kahneman, D., Krueger, A. B., Schkade, D. A., Schwarz, N., & Stone, A. A. (2004). A survey method for characterizing daily life experience: The day reconstruction method. *Science*, 306(5702), 1776–1780. <https://doi.org/10.1126/science.1103572>
- U.S. Bureau of Labor Statistics. American Time Use Survey microdata. <https://www.bls.gov/tus/>; 2015 release: <https://www.bls.gov/news.release/archives/atus_06242016.htm>
- Liu, P. J., Rim, S., Min, L., & Min, K. E. (2023). The surprise of reaching out. *JPSP*, 124(4), 754–771. <https://doi.org/10.1037/pspi0000402>
- Kumar, A., & Epley, N. (2018). Undervaluing gratitude. *Psychological Science*, 29(9). <https://doi.org/10.1177/0956797618772506>
- Boothby, E. J., & Bohns, V. K. (2021). *PSPB*, 47(5), 826–840. <https://doi.org/10.1177/0146167220949003>
- Epley, N., & Schroeder, J. (2014). Mistakenly seeking solitude. *JEP: General*, 143(5), 1980–1999. <https://doi.org/10.1037/a0037323>
- Kardas, M., Kumar, A., & Epley, N. (2022). Overly shallow? *JPSP*, 122(3), 367–398. <https://doi.org/10.1037/pspa0000281>
- Levitt, S. D. (2021). Heads or tails. *Review of Economic Studies*, 88(1), 378–405. <https://www.nber.org/papers/w22487>
- Gilbert, D. T., & Ebert, J. E. J. (2002). Decisions and revisions. *JPSP*, 82(4), 503–514. <https://doi.org/10.1037/0022-3514.82.4.503>
- Gilovich, T., & Medvec, V. H. (1995). The experience of regret. *Psychological Review*, 102(2), 379–395. <https://doi.org/10.1037/0033-295X.102.2.379>
- Richardson, J., & Gilovich, T. (2023). A very public replication of the temporal pattern to people's regrets. <https://pmc.ncbi.nlm.nih.gov/articles/PMC10282588/>
- Masicampo, E. J., & Baumeister, R. F. (2011). Consider it done! *JPSP*, 101(4), 667–683. <https://doi.org/10.1037/a0024192>
- Killingsworth, M. A., & Gilbert, D. T. (2010). A wandering mind is an unhappy mind. *Science*, 330(6006), 932. <https://doi.org/10.1126/science.1192439>
- Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work. *CHI 2008*, 107–110. <https://doi.org/10.1145/1357054.1357072>
