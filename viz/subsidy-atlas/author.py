"""Curated claims, not scraped prices. Regenerate raw.json after edits."""
import json
from pathlib import Path

AS_OF = "2026-09-30"
SOURCES = {
    "chatgpt-free": ("OpenAI · ChatGPT free tier FAQ", "https://help.openai.com/en/articles/9275245-using-chatgpt-s-free-tier-faq", None),
    "pro": ("TechCrunch · Altman on ChatGPT Pro losses", "https://techcrunch.com/2025/01/05/openai-is-losing-money-on-its-pricey-chatgpt-pro-plan-ceo-sam-altman-says/", "2025-01-05"),
    "gemini": ("Google · Gemini Developer API pricing", "https://ai.google.dev/gemini-api/docs/pricing", "2026-09-24"),
    "gemini-terms": ("Google · Gemini API additional terms", "https://ai.google.dev/gemini-api/terms", None),
    "aws": ("AWS · New Free Tier", "https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/", "2025-07-16"),
    "aws-terms": ("AWS · Free Tier FAQs", "https://aws.amazon.com/free/free-tier-faqs/", None),
    "azure": ("Microsoft · Azure free account terms", "https://azure.microsoft.com/en-us/free/", None),
    "grab": ("Grab · FY2025 annual report", "https://www.sec.gov/Archives/edgar/data/1855612/000185561226000020/ck0001855612-20251231.htm", "2026-03-06"),
    "ev": ("LTA / NEA · 2026 EV incentives and phase-out", "https://www.lta.gov.sg/content/ltagov/en/newsroom/2025/9/news-releases/extension_of_ves_and_eeai_to_support_vehicle_electrification.html", "2025-09-08"),
    "solar": ("Clean Energy Regulator · Solar certificate entitlements", "https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme/small-scale-technology-certificates/calculate-small-scale-technology-certificate-entitlements", None),
    "klarna": ("Klarna US · Pay in 4 terms", "https://www.klarna.com/us/pay-in-4/", None),
    "klarna-fees": ("Klarna · Merchant pricing overview", "https://docs.klarna.com/klarna-network-distribution/after-payments/pricing-overview/", None),
    "xbox": ("TechSpot · Microsoft console-loss testimony", "https://www.techspot.com/news/89574-microsoft-exec-confirms-xbox-consoles-have-never-profitable.html", "2021-05-06"),
    "kindle": ("Reuters via Moneycontrol · Kindle sold at cost", "https://www.moneycontrol.com/news/business/wire-news/-2013923.html", "2012-10-12"),
    "disney": ("Disney · FY2024 earnings", "https://thewaltdisneycompany.com/press-releases/the-walt-disney-company-reports-fourth-quarter-and-full-year-earnings-for-fiscal-2024/", "2024-11-14"),
    "uber": ("Uber · IPO S-1", "https://www.sec.gov/Archives/edgar/data/1543151/000119312519103850/d647752ds1.htm", "2019-04-11"),
    "uber-prices": ("Uber · FY2020 annual report (2019 pricing changes)", "https://www.sec.gov/Archives/edgar/data/1543151/000154315121000014/uber-20201231.htm", "2021-03-01"),
    "moviepass": ("TechCrunch · MoviePass unlimited plan", "https://techcrunch.com/2018/05/02/moviepass-brings-back-unlimited-movie-subscription-plan/", "2018-05-02"),
    "moviepass-loss": ("Helios & Matheson · Q2 2018 Form 10-Q", "https://www.sec.gov/Archives/edgar/data/1040792/000121390018011086/f10q0618_heliosandmatheson.htm", None),
    "moviepass-end": ("Helios & Matheson · 2019 MoviePass suspension", "https://www.sec.gov/Archives/edgar/data/1040792/000121390019017981/f8k091319ex99-2_helios.htm", "2019-09-13"),
    "runway": ("Runway · Series D for media generation", "https://runway.com/news/runway-series-d-funding", "2025-04-03"),
    "anthropic": ("Anthropic · $13B Series F", "https://www.anthropic.com/news/anthropic-raises-series-f-at-usd183b-post-money-valuation", "2025-09-02"),
}

VOCAB = {
    "category": {"llm": "LLM tokens & subscriptions", "cloud": "Cloud", "transport": "Ride-hailing", "delivery": "Food delivery", "energy": "EVs & solar", "hardware": "Consumer hardware", "streaming": "Streaming & entertainment", "finance": "BNPL & fintech"},
    "subsidiser": {"investors": "Investor-funded", "cross-subsidy": "Provider / cross-subsidy", "government": "Government policy", "merchants": "Merchant-funded"},
    "depth": {"free": "Free within limits", "partial": "Partial / capped", "near-cost": "Near cost", "unknown": "Loss reported; depth unknown"},
    "stage": {"acquisition": "Acquisition offer", "ongoing": "Ongoing programme", "tapering": "Scheduled taper", "historical": "Historical evidence"},
}


def block(text, *sources):
    return {"text": text, "sources": list(sources)}


def entry(id, name, categories, subsidiser, depth, stage, metric, evidence, depth_note, duration, caution):
    return dict(id=id, name=name, categories=categories, subsidiser=subsidiser, depth=depth, stage=stage,
                speculative=False, metric=metric, evidence=evidence, depth_note=depth_note, duration=duration,
                caution=caution)


ENTRIES = [
    entry("chatgpt-free", "ChatGPT free consumer tier", ["llm"], "cross-subsidy", "free", "acquisition", "Free access, with usage limits",
          block("OpenAI's Free Tier FAQ describes ChatGPT access without a subscription charge, with limits on messages and tools. A free consumer tier is distinct from paid API token pricing.", "chatgpt-free"),
          block("Zero subscription charge within the free tier's limits. Serving cost and any cross-subsidy per user are not quantified by the FAQ.", "chatgpt-free"),
          block("The cited FAQ gives usage restrictions, not a guaranteed future end date. Recheck terms before relying on continued free access.", "chatgpt-free"),
          block("Consumer judgement: test whether the free allowance meets your need before paying for higher limits. Free access does not establish that paid plans are below cost.", "chatgpt-free")),
    entry("gemini-free", "Gemini API free tier", ["llm"], "cross-subsidy", "free", "acquisition", "Free input & output tokens",
          block("Google lists free input and output tokens for limited access to selected models. This is a provider-funded free service, not evidence that all paid Gemini tokens lose money.", "gemini"),
          block("100% of the listed token fee is waived within eligible free quotas. Google's underlying serving cost and paid-tier margins are not disclosed here.", "gemini"),
          block("Rate and model limits apply; no guaranteed end date for the free tier is stated. Recheck the live pricing page.", "gemini"),
          block("Unpaid-service content may be used to improve products. Do not put confidential data into a free-tier experiment.", "gemini", "gemini-terms")),
    entry("aws-free", "AWS Free Tier credits", ["cloud"], "cross-subsidy", "free", "acquisition", "Up to US$200 credits",
          block("New customers receive US$100 at signup and can earn up to US$100 more through eligible activities. AWS absorbs eligible billed usage through promotional credits.", "aws"),
          block("Up to 100% of eligible charges within the credit balance; this is a list-price concession, not an estimate of AWS's cost.", "aws"),
          block("Free account plan: up to six months, or until credits run out. Credits expire 12 months after account creation; upgrading can expose you to paid charges.", "aws-terms"),
          block("Start when you have a project, not merely to reserve a deal: the clock starts at account creation. Services and eligibility are restricted.", "aws-terms")),
    entry("azure-free", "Azure free account", ["cloud"], "cross-subsidy", "free", "acquisition", "US$200 / 30 days",
          block("Microsoft offers new Azure customers US$200 of credit for 30 days, plus specified free service allowances.", "azure"),
          block("Eligible usage can cost the customer zero within the credit allowance. Infrastructure cost and the cost-based subsidy percentage are unknown.", "azure"),
          block("Credit lasts 30 days. Continuing service requires moving to pay-as-you-go; free allowances have their own limits and durations.", "azure"),
          block("Treat this as a timed trial. Check upgrade, allowance and billing terms before relying on a workload remaining free.", "azure")),
    entry("grab-promos", "Grab rides & delivery promotions", ["transport", "delivery"], "cross-subsidy", "partial", "ongoing", "US$1.268B consumer incentives / FY2025",
          block("Grab reports US$1.268B of consumer incentives and US$1.002B of partner incentives in FY2025. Consumer incentives are discounts and promotions that reduce revenue; this proves funded discounts, not that every trip or meal is below cost.", "grab"),
          block("US$2.270B combined partner and consumer incentives, about 10% of on-demand GMV in the filing. This is a platform aggregate, not a 10% discount on your order; rides and delivery share this figure.", "grab"),
          block("Latest annual evidence is FY2025, not a promise of a coupon today. No fixed programme expiry is given in that report.", "grab"),
          block("Compare the actual all-in fare or basket, including fees. A platform's incentive spending is not your personal saving.", "grab")),
    entry("singapore-ev", "Singapore EV early-adoption rebate", ["energy"], "government", "partial", "tapering", "45% of ARF, capped at S$7,500",
          block("For fully electric cars and taxis registered in 2026, EEAI rebates 45% of Additional Registration Fee (ARF), capped at S$7,500. Government forgoes tax; this is not a vehicle-manufacturer loss.", "ev"),
          block("45% applies to ARF, not to the car's total price. Vehicle eligibility and other tax schemes matter; do not infer a 45% vehicle discount.", "ev"),
          block("EEAI ceases from 1 January 2027. The 2026 cap is lower than the S$15,000 cap for 2025 registrations.", "ev"),
          block("Consumer judgement: an expiry alone is not a reason to buy a car. Compare total ownership costs and confirm registration timing and eligibility.", "ev")),
    entry("solar-au", "Australia rooftop solar certificates", ["energy"], "government", "partial", "tapering", "5-year deeming period in 2026",
          block("Eligible small-scale solar installations generate upfront small-scale technology certificates (STCs) under Australia's policy scheme. The certificate entitlement supports an installation discount; it is not proof of below-cost panel manufacture.", "solar"),
          block("No universal percentage: entitlement depends on system size, location and installation year. Certificate value is not a fixed retail-price rebate.", "solar"),
          block("For small-scale PV, the deeming period falls from five years in 2026 to four in 2027 and one in 2030; the scheme's scheduled end is 2030.", "solar"),
          block("Consumer judgement: obtain an itemised installer quote and check that certificate assignment and eligibility are included. Do not assume the same discount across homes.", "solar")),
    entry("battery-au", "Australia home battery certificates", ["energy"], "government", "partial", "tapering", "Around 30% upfront installation support",
          block("The Clean Energy Regulator says solar battery certificate factors are adjusted to support around a 30% discount on upfront installation costs. This is policy support, not a claim that batteries are manufactured at a loss.", "solar"),
          block("Around 30% is the scheme's stated design, not a guaranteed quote. The STC factor applies fully to the first 14 kWh, at 60% for capacity above 14 up to 28 kWh, and at 15% above 28 up to 50 kWh.", "solar"),
          block("The factor is 6.8 certificates per usable kWh for May–December 2026 and steps down in later periods, reaching 2.1 in July–December 2030, before capacity tapering.", "solar"),
          block("Consumer judgement: check eligibility and the itemised installed price. A bigger subsidised battery is not automatically a better deal for your household.", "solar")),
    entry("klarna-pay4", "Klarna Pay in 4 (US)", ["finance"], "merchants", "partial", "ongoing", "0 interest if paid on time",
          block("Klarna's US Pay in 4 divides a purchase into four interest-free payments. Its merchant documentation describes fixed and variable transaction fees: merchants fund access to the payment service.", "klarna", "klarna-fees"),
          block("Zero consumer interest is a financing concession, not a discount on the goods. Merchant fees and provider unit costs vary, so no cost-based subsidy percentage is assigned.", "klarna", "klarna-fees"),
          block("Four payments, every two weeks, for eligible transactions. No end date for the product is stated in the cited live terms.", "klarna"),
          block("Late fees may apply. This is not advice to borrow or spend more: compare with paying now, and use only if repayment is already affordable.", "klarna")),
    entry("pro-2025", "ChatGPT Pro: January 2025 loss report", ["llm"], "investors", "unknown", "historical", "US$200/month; loss admitted",
          block("In January 2025, Sam Altman said OpenAI was losing money on ChatGPT Pro because usage exceeded expectations at US$200/month. TechCrunch also reported expected company losses of about US$5B on US$3.7B revenue for 2024.", "pro"),
          block("Product-level loss was stated, but no per-subscriber cost was disclosed. Company losses include training and overhead and cannot be converted into a token subsidy percentage.", "pro"),
          block("Historical evidence only. This report does not establish Pro's September 2026 price, limits or profitability.", "pro"),
          block("Investor funding is the financing context, not a traced transfer to each user. Do not assume that every OpenAI, Anthropic or Google paid plan is below marginal serving cost.", "pro")),
    entry("xbox-2021", "Xbox console loss-leader model", ["hardware"], "cross-subsidy", "unknown", "historical", "Hardware sold at a loss / 2021 testimony",
          block("In May 2021, Microsoft executive Lori Wright testified that Microsoft had never earned a profit on sales of Xbox consoles; games and subscriptions were the intended profit pool.", "xbox"),
          block("No per-console loss figure was disclosed in this testimony. Software economics are separate from hardware margins.", "xbox"),
          block("Historical model, not verified current hardware economics. No future cheap-console window is established by the testimony.", "xbox"),
          block("Consumer judgement: compare the console plus games and subscriptions, rather than treating an initial hardware loss as a bargain by itself.", "xbox")),
    entry("kindle-2012", "Kindle at-cost hardware", ["hardware"], "cross-subsidy", "near-cost", "historical", "At cost / Bezos, 2012",
          block("In October 2012, Jeff Bezos told Reuters that Kindle devices were sold at cost, with earnings expected from content. At cost is break-even hardware, not demonstrated below-cost pricing.", "kindle"),
          block("Approximately zero hardware margin according to the CEO's statement, without an audited unit-cost breakdown. No subsidy percentage is assigned.", "kindle"),
          block("Historical statement only; it does not establish today's Kindle margins or prices.", "kindle"),
          block("Consumer judgement: include content purchases and switching costs. A cheap device can be an entry point to a paid ecosystem.", "kindle")),
    entry("disney-streaming", "Disney streaming's loss-to-profit transition", ["streaming"], "cross-subsidy", "unknown", "historical", "US$2.612B loss → US$134M profit",
          block("Disney's combined streaming businesses reported US$2.612B non-GAAP operating loss in FY2023 and US$134M operating income in FY2024. These are combined-business results, not per-subscriber subsidy estimates.", "disney"),
          block("Losses demonstrate the segment's investment phase, not that each subscription was below marginal cost. A percentage subsidy would require a comparable unit-cost denominator.", "disney"),
          block("The combined streaming business was already profitable in FY2024. This is an ended loss-making phase, not a current below-cost deal.", "disney"),
          block("Disney attributes improved quarterly direct-to-consumer results partly to subscription revenue growth from higher retail pricing and subscriber growth. Price changes and operating improvements can end a loss phase.", "disney")),
    entry("uber-growth", "Uber's growth-era discounts", ["transport"], "investors", "unknown", "historical", "US$1.8B adjusted EBITDA loss / 2018",
          block("Uber's IPO filing reported a US$1.8B adjusted EBITDA loss in 2018 and described driver incentives and consumer discounts as marketplace-growth tools. Adjusted EBITDA loss is not GAAP net loss or a per-ride loss.", "uber"),
          block("No defensible cost-based percentage per ride. Platform spending and losses cannot tell you how much of your individual trip was subsidised.", "uber"),
          block("Historical growth phase. Uber's FY2020 report attributes part of 2019 Mobility revenue growth to US pricing changes in Q2 and Q3 2019.", "uber-prices"),
          block("Consumer judgement: do not build a permanent budget around temporary discounts. Price rises need not be the sole explanation for changing platform profitability.", "uber", "uber-prices")),
    entry("moviepass-2018", "MoviePass's original unlimited plan", ["streaming"], "investors", "unknown", "historical", "US$9.95/month for up to a film a day",
          block("In May 2018, MoviePass offered up to one standard 2D film per day for US$9.95/month. Its parent reported US$126.639M loss from operations in Q2 2018. The September 2019 announcement suspended subscriber service because efforts to recapitalise had failed.", "moviepass", "moviepass-loss", "moviepass-end"),
          block("The loss is the parent's consolidated operating result, not a per-MoviePass-customer cost. No universal subsidy percentage is supported by these sources.", "moviepass-loss"),
          block("The original service suspended operations on 14 September 2019. This does not describe any later relaunched MoviePass product.", "moviepass-end"),
          block("Consumer judgement: prefer a reversible monthly experiment over prepaying for a fragile unlimited promise.", "moviepass-end")),
]

FORECASTS = [
    dict(id="ai-agents", name="AI coding and agent trial allowances", speculative=True,
         reasoning="Speculation: competition and large funding rounds may sustain cheap trial usage for new agent products. Try a monthly plan only when it replaces work you already do; funding does not prove a product subsidy.",
         signals=[block("Anthropic announced US$13B of Series F funding in September 2025. Google currently offers selected Gemini API tokens free within limits.", "anthropic", "gemini")],
         changes="Reverse the call if trials shrink, paid plans impose metered overages, or independent cost evidence shows profitable pricing. Never depend on a trial for an irreversible workflow."),
    dict(id="video-trials", name="Generative-video introductory allowances", speculative=True,
         reasoning="Speculation: newly launched video generators may use cheap trial credits to attract creators before pursuing sustainable paid pricing. Worth trying early for a small, non-critical creative project, not prepaying for an unlimited promise. Funding alone does not prove below-cost generation.",
         signals=[block("Runway announced over US$300M in Series D funding on 3 April 2025 to advance media-generation research and expand Runway Studios. This is a capital signal, not an announcement of future discounted credits.", "runway")],
         changes="Reverse the call if trials disappear, usage caps make them impractical, commercial-use terms do not fit the project, or paid unit economics are already sustainable. Keep source media and outputs portable."),
    dict(id="solar-next", name="Solar policy support before the next taper", speculative=True,
         reasoning="Speculation: qualifying Australian installations may continue to receive policy support in the remaining scheme years, but later entitlements shrink. Get quotes early if you already want solar; installation-cost declines could outweigh the lost certificates.",
         signals=[block("The regulator's small-scale PV schedule gives five deeming years in 2026, four in 2027, and one in 2030. This schedule is evidence; any prediction about the best purchase date is not.", "solar")],
         changes="Reverse the call if rules change, you are ineligible, installer prices rise to absorb the incentive, or waiting delivers a better all-in quote."),
]


def dataset():
    return dict(as_of=AS_OF, vocabulary=VOCAB,
                sources={k: dict(title=v[0], url=v[1], published=v[2], accessed=AS_OF) for k, v in SOURCES.items()},
                entries=ENTRIES, forecasts=FORECASTS)


if __name__ == "__main__":
    Path(__file__).with_name("raw.json").write_text(json.dumps(dataset(), indent=2, ensure_ascii=False) + "\n")
