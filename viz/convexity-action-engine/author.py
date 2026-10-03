#!/usr/bin/env python3
"""Author the action ontology for the convexity-action-engine visualization.

Every number here is author judgement: category priors plus per-action
overrides, on 0-4 ordinal scales (durations in minutes, hours in Singapore local
time). No external dataset was retrieved when this was written; the planned
sources are listed in SOURCES with that status. Running this script writes
raw.json next to it; build.py --verify checks that the committed raw.json
matches this script's output.
"""
import json
import re
import unicodedata
from pathlib import Path

OUT = Path(__file__).resolve().parent / "raw.json"

FIELDS = ["dur", "setup", "money", "act", "phys", "cog",
          "hea", "soc", "lrn", "joy", "car", "rec", "hom", "fin", "lt",
          "unc", "rev", "decay", "opt", "info", "reg", "intr", "dn", "tail", "nov", "freq", "out", "day", "open", "sg", "atus", "drm",
          "ev", "typ", "best", "evt"]

# Category priors. typ/best are lists of [hour, sd]; best is only set where a
# normative timing claim is being made, with its own evidence grade evt.
CATS = {
 "work": dict(atus="0501", drm="Working", tail=1, label="Work", dur=[30, 90, 180], setup=5, money=0, act=3, phys=0, cog=4, hea=0, soc=0, lrn=1, joy=1, car=4, rec=0, hom=0, fin=2, lt=3,
              unc=2, rev=4, decay=2, opt=3, info=2, reg=2, intr=3, dn=0, nov=1, freq=3, ev=1, typ=[[10, 2], [14.5, 2]],
              goals="work,progress,focus", flags="f", places="home,office,cafe,library",
              comp="take-a-short-break,go-for-a-walk,make-coffee,drink-water", opp="stop-working-for-the-day,rest"),
 "learning": dict(atus="0603", tail=2, label="Learning", dur=[20, 60, 120], setup=5, money=0, act=3, phys=0, cog=4, hea=0, soc=0, lrn=4, joy=2, car=2, rec=0, hom=0, fin=0, lt=4,
              unc=2, rev=4, decay=1, opt=3, info=4, reg=1, intr=2, dn=0, nov=2, freq=1, ev=2, typ=[[20, 3]],
              goals="learning,skill,understanding", flags="f", places="home,library,cafe",
              comp="take-notes,review-flashcards", opp="apply-what-you-know,stop-researching"),
 "exercise": dict(atus="1301", drm="Exercising", tail=0, label="Exercise", dur=[20, 45, 90], setup=10, money=0, act=3, phys=3, cog=1, hea=4, soc=0, lrn=0, joy=2, car=0, rec=2, hom=0, fin=0, lt=4,
              unc=1, rev=4, decay=1, opt=2, info=1, reg=2, intr=1, dn=1, nov=1, freq=1, ev=3, typ=[[7, 1.5], [18, 2]], best=[[17.5, 2.5]], evt=1,
              goals="fitness,health,stress-reduction,exercise", flags="fs", places="gym,outside,home,park",
              comp="stretch,drink-water,take-a-shower,eat-a-snack", opp="rest,nap"),
 "health": dict(atus="0103", tail=0, label="Health & self-care", dur=[5, 20, 60], setup=0, money=0, act=1, phys=1, cog=1, hea=3, soc=0, lrn=0, joy=1, car=0, rec=2, hom=0, fin=0, lt=3,
              unc=1, rev=4, decay=2, opt=1, info=1, reg=2, intr=1, dn=0, nov=0, freq=2, ev=2, typ=[[8, 2], [21, 2]],
              goals="health,self-care", flags="f", places="",
              comp="drink-water,go-to-bed-early", opp="skip-it-today"),
 "sleep": dict(atus="0101", tail=0, label="Sleep & rest", dur=[10, 30, 90], setup=0, money=0, act=0, phys=0, cog=0, hea=3, soc=0, lrn=0, joy=2, car=0, rec=4, hom=0, fin=0, lt=2,
              unc=1, rev=4, decay=1, opt=1, info=0, reg=1, intr=1, dn=0, nov=0, freq=3, ev=2, typ=[[14, 1.5], [23, 1.5]],
              goals="rest,recovery,sleep", flags="f", places="",
              comp="put-your-phone-away,drink-water", opp="continue-working,drink-coffee"),
 "food": dict(atus="1101", drm="Eating", tail=0, label="Food", dur=[15, 30, 60], setup=5, money=1, act=1, phys=0, cog=0, hea=2, soc=1, lrn=0, joy=3, car=0, rec=2, hom=0, fin=0, lt=1,
              unc=1, rev=3, decay=3, opt=1, info=0, reg=1, intr=1, dn=0, nov=1, freq=4, ev=2, typ=[[7.5, 1], [12.5, 1], [19, 1.2]],
              goals="nutrition,energy,food", flags="s", places="home,restaurant",
              comp="take-a-walk-after-eating,do-the-dishes,drink-water", opp="skip-this-meal"),
 "cooking": dict(atus="020201", drm="Preparing food", tail=0, label="Cooking", dur=[20, 45, 120], setup=5, money=1, act=2, phys=1, cog=1, hea=3, soc=1, lrn=1, joy=2, car=0, rec=1, hom=2, fin=2, lt=2,
              unc=1, rev=3, decay=2, opt=1, info=1, reg=1, intr=2, dn=0, nov=1, freq=3, ev=2, typ=[[12, 1], [18.5, 1.2]],
              goals="nutrition,food,saving-money", flags="fs", places="",
              comp="do-the-dishes,go-grocery-shopping", opp="order-takeaway"),
 "relationships": dict(atus="1201", drm="Socializing", tail=2, label="Relationships", dur=[20, 60, 180], setup=10, money=1, act=2, phys=0, cog=1, hea=1, soc=4, lrn=0, joy=3, car=0, rec=2, hom=0, fin=0, lt=3,
              unc=2, rev=3, decay=2, opt=2, info=1, reg=3, intr=2, dn=0, nov=1, freq=2, ev=3, typ=[[19.5, 2]],
              goals="connection,relationships,belonging", flags="f", places="",
              comp="send-a-text-message,plan-the-next-meetup", opp="spend-time-alone"),
 "communication": dict(atus="020904", drm="Computer/e-mail/Internet", tail=1, label="Communication", dur=[5, 15, 45], setup=0, money=0, act=1, phys=0, cog=2, hea=0, soc=1, lrn=0, joy=0, car=2, rec=0, hom=1, fin=0, lt=1,
              unc=1, rev=3, decay=3, opt=1, info=1, reg=1, intr=2, dn=0, nov=0, freq=4, ev=1, typ=[[9.5, 1.5], [16, 2]],
              goals="communication,coordination,admin", flags="f", places="",
              comp="batch-your-messages", opp="turn-off-notifications"),
 "leisure": dict(atus="1203", tail=0, label="Leisure", dur=[20, 60, 180], setup=0, money=0, act=1, phys=0, cog=1, hea=0, soc=0, lrn=1, joy=3, car=0, rec=3, hom=0, fin=0, lt=1,
              unc=1, rev=4, decay=0, opt=1, info=1, reg=0, intr=1, dn=0, nov=1, freq=3, ev=1, typ=[[21, 2]],
              goals="enjoyment,relaxation,leisure", flags="fs", places="home,outside",
              comp="make-tea", opp="do-something-useful"),
 "digital": dict(atus="120308", drm="Computer/e-mail/Internet", tail=0, label="Screens & media", dur=[5, 30, 120], setup=0, money=0, act=0, phys=0, cog=1, hea=0, soc=1, lrn=1, joy=2, car=0, rec=1, hom=0, fin=0, lt=0,
              unc=1, rev=4, decay=0, opt=0, info=1, reg=0, intr=1, dn=1, nov=1, freq=4, ev=1, typ=[[21.5, 2.5]],
              goals="entertainment,distraction,news", flags="f", places="",
              comp="set-a-timer", opp="put-your-phone-away,go-for-a-walk"),
 "household": dict(atus="0201", drm="Housework", tail=0, label="Household", dur=[10, 30, 90], setup=0, money=0, act=2, phys=2, cog=0, hea=1, soc=0, lrn=0, joy=0, car=0, rec=0, hom=4, fin=0, lt=2,
              unc=0, rev=4, decay=1, opt=1, info=0, reg=1, intr=1, dn=0, nov=0, freq=3, ev=1, typ=[[10.5, 2.5], [19.5, 1.5]],
              goals="home,order,chores", flags="f", places="",
              comp="put-on-music,take-out-the-rubbish", opp="leave-it-for-now"),
 "errands": dict(atus="0701", drm="Shopping", tail=0, label="Errands", dur=[15, 40, 90], setup=15, money=1, act=2, phys=1, cog=1, hea=0, soc=0, lrn=0, joy=0, car=0, rec=0, hom=3, fin=1, lt=2,
              unc=1, rev=3, decay=2, opt=1, info=0, reg=2, intr=1, dn=0, nov=0, freq=2, ev=1, typ=[[11, 2.5], [17.5, 1.5]],
              goals="errands,chores,admin", flags="", places="",
              comp="batch-your-errands", opp="leave-it-for-now,order-it-online"),
 "purchases": dict(atus="0701", drm="Shopping", tail=0, label="Purchases", dur=[10, 30, 90], setup=0, money=2, act=1, phys=0, cog=2, hea=0, soc=0, lrn=0, joy=2, car=0, rec=0, hom=1, fin=0, lt=1,
              unc=2, rev=2, decay=1, opt=1, info=2, reg=1, intr=1, dn=1, nov=2, freq=2, ev=1, typ=[[20.5, 2.5], [12.5, 1.5]],
              goals="shopping,purchase,possessions", flags="", places="",
              comp="read-reviews,compare-prices", opp="wait-24-hours-before-buying,save-the-money"),
 "travel": dict(atus="18", tail=2, label="Travel & outings", dur=[120, 240, 600], setup=30, money=2, act=3, phys=2, cog=1, hea=1, soc=2, lrn=2, joy=4, car=0, rec=2, hom=0, fin=0, lt=2,
              unc=2, rev=2, decay=2, opt=2, info=3, reg=2, intr=2, dn=1, nov=3, freq=1, ev=1, typ=[[10, 2.5]],
              goals="adventure,novelty,enjoyment,travel", flags="s", places="",
              comp="pack-a-bag,check-the-weather", opp="stay-home"),
 "admin": dict(atus="0209", tail=0, label="Admin & money", dur=[10, 30, 90], setup=0, money=0, act=3, phys=0, cog=2, hea=0, soc=0, lrn=0, joy=0, car=1, rec=0, hom=2, fin=3, lt=3,
              unc=1, rev=3, decay=3, opt=2, info=1, reg=3, intr=2, dn=0, nov=0, freq=1, ev=1, typ=[[10.5, 2], [20.5, 1.5]],
              goals="admin,money,security", flags="f", places="",
              comp="set-a-reminder", opp="leave-it-for-now"),
 "creative": dict(atus="120309", tail=2, label="Creative", dur=[20, 60, 150], setup=5, money=0, act=3, phys=0, cog=3, hea=0, soc=0, lrn=3, joy=3, car=1, rec=1, hom=0, fin=0, lt=3,
              unc=2, rev=4, decay=1, opt=2, info=2, reg=2, intr=3, dn=0, nov=3, freq=1, ev=1, typ=[[20.5, 2.5]],
              goals="creativity,expression,skill", flags="fs", places="home,cafe,outside",
              comp="take-a-short-break,put-on-music", opp="consume-instead-of-create"),
 "mind": dict(atus="120301", tail=1, label="Mind & reflection", dur=[5, 15, 45], setup=0, money=0, act=1, phys=0, cog=1, hea=2, soc=0, lrn=1, joy=1, car=0, rec=3, hom=0, fin=0, lt=3,
              unc=1, rev=4, decay=1, opt=2, info=2, reg=1, intr=1, dn=0, nov=1, freq=1, ev=2, typ=[[7.5, 1.5], [22, 1.5]],
              goals="clarity,stress-reduction,reflection", flags="f", places="home,outside",
              comp="drink-water", opp="keep-busy"),
 "grooming": dict(atus="0102", tail=0, label="Grooming", dur=[5, 10, 30], setup=0, money=0, act=1, phys=0, cog=0, hea=1, soc=0, lrn=0, joy=1, car=0, rec=1, hom=1, fin=0, lt=1,
              unc=0, rev=4, decay=1, opt=0, info=0, reg=1, intr=1, dn=0, nov=0, freq=4, ev=1, typ=[[7.5, 1], [21.5, 1.5]],
              goals="self-care,appearance,hygiene", flags="", places="", comp="take-a-shower", opp="skip-it-today"),
 "care": dict(atus="0301", drm="Taking care of my children", tail=1, label="Caring for others", dur=[15, 45, 120], setup=5, money=0, act=2, phys=1, cog=1, hea=0, soc=4, lrn=0, joy=2, car=0, rec=0, hom=2, fin=0, lt=4,
              unc=1, rev=3, decay=3, opt=1, info=1, reg=4, intr=2, dn=0, nov=0, freq=2, ev=2, typ=[[7.5, 1.5], [18.5, 2]],
              goals="care,family,relationships", flags="", places="", comp="rest", opp="arrange-childcare"),
 "civic": dict(atus="15", tail=1, label="Civic & community", dur=[30, 90, 180], setup=20, money=0, act=3, phys=1, cog=1, hea=0, soc=3, lrn=1, joy=2, car=0, rec=0, hom=0, fin=0, lt=3,
              unc=1, rev=3, decay=2, opt=2, info=2, reg=2, intr=1, dn=0, nov=2, freq=0, ev=1, typ=[[10.5, 2.5]],
              goals="community,helping,civic", flags="s", places="", comp="plan-the-next-meetup", opp="stay-home"),
 "life": dict(tail=3, label="Major life decisions", dur=[60, 240, 1440], setup=0, money=2, act=4, phys=0, cog=3, hea=1, soc=2, lrn=2, joy=2, car=2, rec=0, hom=1, fin=1, lt=4,
              unc=4, rev=1, decay=2, opt=2, info=4, reg=3, intr=1, dn=3, nov=3, freq=0, ev=1,
              goals="life-change,deliberation", flags="", places="", comp="sleep-on-it,journal-about-a-decision", opp="wait-and-see"),
 "avoid": dict(tail=0, label="Avoid", dur=[5, 30, 90], setup=0, money=0, act=1, phys=0, cog=0, hea=0, soc=0, lrn=0, joy=1, car=0, rec=0, hom=0, fin=0, lt=0,
              unc=3, rev=1, decay=0, opt=0, info=0, reg=0, intr=0, dn=2, nov=1, freq=1, ev=1,
              goals="avoid", flags="", places="", comp="", opp=""),
 "inaction": dict(tail=0, label="Inaction", dur=[5, 30, 120], setup=0, money=0, act=0, phys=0, cog=0, hea=0, soc=0, lrn=0, joy=1, car=0, rec=1, hom=0, fin=0, lt=0,
              unc=0, rev=4, decay=0, opt=3, info=0, reg=1, intr=0, dn=0, nov=0, freq=3, ev=1,
              goals="rest,waiting", flags="", places="", comp="", opp=""),
}

# name | aliases (comma) | overrides "k=v" (dur=lo/typ/hi; typ/best=h:sd;h:sd; goals=a,b; comp/opp/subs=ids)
ACTIONS = (Path(__file__).resolve().parent / "ontology.txt").read_text(encoding="utf-8")


# Additional bases generated from purchase objects, sports and study subjects so
# the base set covers ordinary vocabulary. Each gets category priors plus the
# overrides listed here.
PURCHASE_OBJECTS = [
    ("a keyboard", 3, "keyboard,mechanical keyboard"), ("a monitor", 3, "monitor,screen,display"),
    ("a tablet", 4, "ipad,tablet"), ("a camera", 4, "camera"), ("a watch", 3, "watch"),
    ("a backpack", 2, "bag,backpack"), ("a coffee machine", 3, "coffee machine,espresso machine"),
    ("a mattress", 4, "mattress"), ("a vacuum cleaner", 3, "vacuum cleaner,robot vacuum"),
    ("an air purifier", 3, "air purifier"), ("a desk lamp", 2, "lamp"), ("sunglasses", 2, "sunglasses"),
    ("a water bottle", 1, "water bottle,bottle"), ("a speaker", 3, "speaker,bluetooth speaker"),
    ("a game", 2, "video game,new game"), ("concert tickets", 3, "tickets,concert tickets"),
    ("a gym membership", 3, "gym membership,membership"), ("a course", 3, "buy a course,paid course"),
    ("skincare products", 2, "skincare products,moisturiser"), ("a gift card", 2, "gift card,voucher"),
    ("kitchen knives", 2, "knife,knives"), ("a blender", 2, "blender"), ("an umbrella", 1, "umbrella"),
    ("a suitcase", 3, "suitcase,luggage"), ("a phone case", 1, "phone case,case"), ("a chair", 3, "office chair"),
    ("a car", 4, "car,new car"), ("a TV", 4, "television set,tv set"), ("a console", 4, "ps5,switch,xbox"),
    ("a printer", 3, "printer"), ("board games", 2, "buy board game"), ("plants for the balcony", 1, "balcony plants"),
    ("new bedding", 2, "bedding,pillow,duvet"), ("a fan", 2, "fan,aircon"), ("a rice cooker", 2, "rice cooker"),
]
SPORTS = ["badminton", "tennis", "squash", "table tennis", "football", "basketball", "volleyball", "golf",
          "frisbee", "pickleball", "netball", "hockey", "cricket", "rugby", "futsal"]
SUBJECTS = ["statistics", "programming", "history", "economics", "physics", "chemistry", "biology", "philosophy",
            "psychology", "design", "writing", "machine learning", "finance", "law", "music theory", "art history",
            "a new language", "linear algebra", "calculus", "probability", "accounting", "marketing", "cooking theory",
            "public speaking", "negotiation", "nutrition", "first aid", "photography", "geography", "astronomy"]
SPORTS += ["baseball", "softball", "water polo", "handball", "floorball", "dodgeball", "sepak takraw", "touch rugby",
           "beach volleyball", "padel", "tchoukball", "lacrosse", "futsal with colleagues", "5-a-side football", "cricket in the park"]
SUBJECTS += ["data science", "writing proofs", "number theory", "topology", "algebra", "geometry", "game theory", "decision theory",
             "microeconomics", "macroeconomics", "sociology", "anthropology", "linguistics", "neuroscience", "genetics",
             "climate science", "urban planning", "architecture", "film studies", "classics", "music production",
             "cryptography", "operating systems", "databases", "web development", "Singapore history", "personal finance",
             "investing", "negotiation tactics", "project management"]
PURCHASE_OBJECTS += [
    ("a bicycle helmet", 2, "helmet,bike helmet"), ("a yoga mat", 1, "yoga mat"), ("dumbbells", 2, "weights,dumbbell set"),
    ("a fitness tracker", 3, "fitness tracker,fitbit,garmin"), ("a smartwatch", 3, "apple watch"), ("a drone", 4, "drone"),
    ("a guitar", 3, "guitar"), ("a digital piano", 4, "keyboard piano,digital piano"), ("art supplies", 2, "paints,sketchbook,art supplies"),
    ("a board game", 2, "new board game"), ("a jigsaw puzzle", 1, "puzzle"), ("a notebook", 1, "notebook,journal"),
    ("a fountain pen", 2, "pen,fountain pen"), ("a desk", 3, "desk"), ("a bookshelf", 3, "bookshelf,shelves"),
    ("a lamp", 2, "floor lamp"), ("curtains", 2, "blinds"), ("a rug", 3, "rug,carpet"), ("bed sheets", 2, "sheets,linen"),
    ("towels", 1, "bath towels"), ("a kettle", 1, "electric kettle"), ("a pot or pan", 2, "frying pan,wok,pot"),
    ("a knife set", 2, "chef knife"), ("food containers", 1, "tupperware,containers"), ("a water filter", 2, "filter jug,water filter"),
    ("a dehumidifier", 3, "dehumidifier"), ("a portable charger", 1, "power bank,charger"), ("a phone", 4, "smartphone"),
    ("earbuds", 3, "wireless earbuds"), ("a webcam", 2, "webcam"), ("a microphone", 2, "mic,usb mic"),
    ("a second monitor", 3, "extra monitor"), ("an external hard drive", 2, "hard drive,ssd,backup drive"),
    ("a router", 2, "wifi router,mesh wifi"), ("software", 2, "app subscription,license"), ("a video game", 2, "game purchase"),
    ("a new outfit", 2, "outfit"), ("work shoes", 3, "formal shoes,office shoes"), ("sandals", 1, "slippers,flip flops"),
    ("a winter jacket for travel", 3, "jacket,coat"), ("swimwear", 2, "swimsuit,goggles"), ("sportswear", 2, "gym clothes"),
    ("a gift for your parents", 2, "gift for mum,gift for dad"), ("a birthday present", 2, "birthday gift"),
    ("a plant stand", 1, "plant stand"), ("pet supplies", 2, "cat food,dog food,pet food"), ("a pet bed", 2, "dog bed"),
    ("a stroller", 4, "pram,stroller"), ("school supplies", 1, "stationery"), ("a car seat", 3, "child car seat"),
    ("a travel pillow", 1, "neck pillow"), ("luggage tags", 1, "tags"), ("sunblock and insect repellent", 1, "mosquito repellent,insect spray"),
    ("an umbrella for the rainy season", 1, "raincoat"), ("a first aid kit", 1, "first aid kit"), ("a fire extinguisher", 2, "extinguisher"),
    ("a smoke detector", 1, "smoke detector"), ("a door lock", 2, "digital lock,smart lock"), ("a CCTV camera", 2, "home camera,cctv"),
    ("a coffee grinder", 2, "grinder"), ("tea", 1, "tea leaves,loose leaf"), ("wine", 2, "bottle of wine"),
    ("a cake", 2, "birthday cake"), ("a book for a friend", 1, "book gift"), ("a houseplant for a friend", 1, "plant gift"),
]
LANGUAGES = ["Mandarin", "Malay", "Tamil", "Japanese", "Korean", "Spanish", "French", "German", "Italian", "Arabic", "Hindi",
             "Indonesian", "Thai", "Vietnamese", "Cantonese", "Hokkien", "Portuguese", "Russian"]
INSTRUMENTS = ["piano", "guitar", "violin", "drums", "ukulele", "cello", "flute", "saxophone", "bass guitar", "erhu",
               "guzheng", "trumpet", "harmonica"]
SKILLS = [("swim", "exercise"), ("drive", "learning"), ("ride a motorcycle", "learning"), ("code", "learning"), ("sew", "creative"),
          ("knit", "creative"), ("ski", "exercise"), ("surf", "exercise"), ("juggle", "leisure"), ("cook a signature dish", "cooking"),
          ("bake bread", "cooking"), ("use a spreadsheet properly", "learning"), ("speak in public", "learning"),
          ("draw portraits", "creative"), ("paint with watercolour", "creative"), ("sing in tune", "creative"),
          ("do a handstand", "exercise"), ("do a pull-up", "exercise"), ("fix a bike", "household"), ("change a tyre", "household"),
          ("do basic first aid", "health"), ("do CPR", "health"), ("meditate", "mind"), ("type faster", "learning"),
          ("invest", "admin"), ("budget", "admin"), ("negotiate", "learning"), ("edit video", "creative"),
          ("take better photos", "creative"), ("garden", "household"), ("cut your own hair", "grooming"), ("sew a hem", "household"),
          ("play chess well", "leisure"), ("solve a Rubik's cube", "leisure"), ("dance salsa", "exercise"), ("rock climb", "exercise")]
SG_PLACES = [("Fort Canning Park", 1, 1), ("Labrador Nature Reserve", 1, 1), ("Jurong Lake Gardens", 1, 1), ("Chinese Garden", 1, 1),
             ("Punggol Waterway Park", 1, 0), ("Coney Island", 1, 1), ("Sungei Buloh Wetland Reserve", 1, 1), ("Kent Ridge Park", 1, 1),
             ("Bishan-Ang Mo Kio Park", 1, 0), ("Changi Beach", 1, 1), ("Haw Par Villa", 1, 1), ("the National Museum", 0, 0),
             ("the Asian Civilisations Museum", 0, 0), ("the Peranakan Museum", 0, 0), ("the Science Centre", 0, 0),
             ("the Esplanade", 0, 0), ("Tiong Bahru", 1, 0), ("Joo Chiat", 1, 0), ("Holland Village", 1, 0), ("Dempsey Hill", 1, 0),
             ("Clarke Quay", 1, 0), ("Orchard Road", 0, 0), ("Bugis Street", 0, 0), ("Lower Peirce Reservoir", 1, 1),
             ("Pasir Ris Park", 1, 1), ("West Coast Park", 1, 1), ("Lazarus Island", 1, 1), ("Kusu Island", 1, 1),
             ("the Singapore Botanic Gardens", 1, 1), ("Chinatown Complex hawker centre", 0, 0)]
DISHES = ["chicken rice", "laksa", "mee goreng", "nasi goreng", "a stir fry", "dal", "a traybake", "sambal", "congee", "ramen from scratch",
          "dumplings", "a roast chicken", "fish curry", "pad thai", "bibimbap", "tacos", "risotto", "a frittata", "a lentil soup", "banana bread"]
DESTINATIONS = ["Japan", "South Korea", "Taiwan", "Thailand", "Bali", "Vietnam", "Malaysia", "Hong Kong", "Australia", "New Zealand",
                "Europe", "the Philippines", "Sri Lanka", "India", "China"]
SPORT_ATUS = {"badminton": "130120", "tennis": "130120", "squash": "130120", "table tennis": "130120", "padel": "130120",
              "pickleball": "130120", "football": "130126", "futsal": "130126", "5-a-side football": "130126",
              "futsal with colleagues": "130126", "basketball": "130103", "volleyball": "130130", "beach volleyball": "130130",
              "golf": "130114"}
HOBBIES = [("Go birdwatching", "birdwatching,birds", "leisure", "nov=3 phys=1 lrn=2 setup=20"),
           ("Go fishing", "fishing", "leisure", "setup=30 joy=3 rec=4 nov=2"),
           ("Play chess online", "online chess,chess.com,lichess", "leisure", "cog=3 joy=3 lrn=2"),
           ("Visit a library", "library", "learning", "setup=20 lrn=3 joy=2 nov=1"),
           ("Go to a farmers' market", "farmers market,market,wet market", "errands", "joy=3 nov=2 hea=2 soc=1"),
           ("Go ice skating", "ice skating,skating,rollerblading", "exercise", "joy=4 dn=3 nov=3 money=2"),
           ("Go kayaking", "kayak,kayaking,paddle,paddleboard", "exercise", "joy=4 nov=3 money=2 setup=40 dn=2"),
           ("Go to a sauna", "sauna,steam room", "health", "rec=4 joy=3 money=2 setup=20 dur=20/40/60"),
           ("Go to a café alone", "solo cafe", "leisure", "setup=15 money=1 rec=3 joy=3"),
           ("Visit a friend in hospital", "hospital visit", "relationships", "reg=4 soc=4 joy=1 act=3"),
           ("Attend a religious service", "church,temple,mosque,service", "mind", "soc=3 rec=3 setup=20 dur=45/60/120"),
           ("Go to a comedy show", "comedy,stand up", "leisure", "setup=30 money=2 joy=4 soc=2 nov=3 decay=3"),
           ("Go to the theatre", "theatre,theater,play,musical", "leisure", "setup=30 money=3 joy=4 nov=3 dur=120/150/180 decay=4"),
           ("Have a bath", "bath,bubble bath", "health", "rec=4 joy=3 dur=20/30/45"),
           ("Sit in the sun", "sunbathe,sun", "leisure", "rec=3 joy=3 hea=1"),
           ("Go to a hackathon", "hackathon", "work", "soc=3 lrn=4 nov=4 dur=240/480/720 setup=30"),
           ("Tidy your desk", "desk,clean desk,tidy desk", "household", "dur=5/10/15 hom=3 car=1"),
           ("Go for a swim in the sea", "sea swim,open water,ocean swim", "exercise", "dn=3 nov=3 joy=4 setup=40"),
           ("Walk in nature", "nature,forest,forest bathing,green", "exercise", "phys=1 act=1 rec=4 hea=3 setup=20 ev=2"),
           ("Go for a drive", "drive,road trip,go driving", "travel", "dur=45/90/180 setup=5 money=2 joy=3 rec=2 dn=2 phys=0"),
           ]


# Convexity overrides: right tail (tail), ordinary downside (dn), outdoor (out),
# daylight-dependent (day), typical opening hours in Singapore (open=h1-h2, may pass 24).
EXTRA = """
swim places=
go-to-the-gym places=
climb places=
dance places=home
martial-arts-class places=gym
pilates places=gym,home
walk-to-work places=
take-the-stairs places=
do-a-hiit-workout places=home,gym
attend-a-workshop places=
email-the-author places=
stop-researching places=
teach-someone places=
skip-the-meeting places=
stop-working-for-the-day places=
negotiate-your-salary places=
network places=
take-a-short-break places=
make-coffee places=
ask-a-colleague-for-help places=
eat-a-snack places=
have-a-healthy-snack places=
make-tea places=
drink-coffee places=
take-a-walk-after-eating places=
order-takeaway places=
eat-leftovers places=
skip-this-meal places=
check-the-weather flags=
implement-the-idea tail=3
apply-for-a-job tail=4 dn=1
negotiate-your-salary tail=3 dn=2
work-on-a-side-project tail=3
network tail=4 dn=1
write-a-grant tail=3 dn=1
submit-the-work tail=3 dn=1
ask-a-colleague-for-help tail=2
email-the-author tail=4
make-a-new-friend tail=4 dn=1
write-it-up tail=3
brainstorm-ideas tail=3
post-an-update-online tail=2 dn=2
go-on-a-date tail=3 dn=1
host-dinner tail=2
attend-a-workshop tail=3
go-to-a-hackathon tail=4
invest tail=3 dn=3
buy-a-lottery-ticket tail=4 dn=1 car=0 fin=0
visit-a-new-neighbourhood tail=2 out=1 day=1
try-a-new-restaurant tail=1 open=11-22
deep-work tail=2
do-mathematics tail=3
read-a-paper tail=2
read-another-paper tail=1
write-something tail=2
teach-someone tail=2
volunteer tail=2
mentor-someone tail=2
learn-a-language tail=2
learn-a-new-tool tail=2
make-music tail=2
edit-a-video tail=2
update-your-cv tail=2
resolve-a-conflict dn=2 tail=2
apologise-to-someone dn=1 tail=2
skip-the-meeting dn=2
write-a-difficult-email dn=2
have-a-drink dn=2
stay-up-late dn=2
scroll-social-media dn=1
buy-a-car dn=2
go-for-a-walk out=1
go-for-a-run out=1
cycle out=1
go-hiking out=1 day=1
walk-in-nature out=1 day=1
walk-to-work out=1
take-a-walk-after-eating out=1 money=0 decay=1
play-with-your-dog out=1
get-sunlight out=1 day=1
go-to-the-beach out=1 day=1
go-to-the-park out=1
have-a-picnic out=1 day=1
take-photos out=1 day=1
go-birdwatching out=1 day=1
go-fishing out=1 day=1
go-kayaking out=1 day=1 open=8-18.5
go-for-a-swim-in-the-sea out=1 day=1
go-camping out=1
garden out=1
swim out=1 open=8-21.5
go-to-the-gym open=6-23
climb open=10-22.5
go-grocery-shopping open=7-23
go-to-the-post-office open=9-18
go-to-the-bank open=9.5-16.5
go-to-a-museum open=10-19
eat-out open=11-22
eat-at-a-hawker-centre open=7-22
get-a-coffee open=7.5-22
have-brunch open=9-15
get-bubble-tea open=10-22
get-a-haircut open=10-21
see-a-dentist open=9-18
get-a-health-check-up open=8-17
get-a-massage open=10-22
refill-your-prescription open=9-21
go-to-a-bookshop open=10-21.5
go-shopping-for-fun open=10-22
go-to-a-farmers-market open=6-12
get-the-car-serviced open=8.5-17.5
drop-off-dry-cleaning open=9-20
pick-up-a-parcel open=8-22
return-an-item open=10-22
go-to-a-sauna open=10-22
go-to-the-theatre open=19-23
go-to-a-comedy-show open=19.5-23.5
karaoke open=12-26
go-to-the-zoo open=8.5-18
go-to-a-theme-park open=10-19
go-to-a-concert open=19-23.5
people-watch-at-a-cafe open=8-22
work-from-a-cafe open=8-22
go-to-a-cafe-alone open=8-22
visit-a-library open=10-21
play-badminton open=7-23
play-tennis open=7-22 out=1
play-football open=7-23 out=1
play-golf open=7-19 out=1 day=1
play-frisbee out=1
play-pickleball open=7-23
go-ice-skating open=10-22
"""

# Extreme-downside screen inputs for ordinary actions: kind | probability label
# (never a number) | severity 0-4 | irreversibility 0-4 | repeated exposure | trigger.
RUIN = {
 "swim": ("drowning", "very low (supervised pool)", 4, 4, 1, "swimming alone, open water, alcohol, exhaustion, lightning"),
 "go-for-a-swim-in-the-sea": ("drowning", "low; unknown for a given spot", 4, 4, 1, "currents, swimming alone, storms"),
 "go-kayaking": ("drowning or capsizing", "low", 4, 4, 1, "no buoyancy aid, squalls"),
 "cycle": ("road traffic injury", "low", 4, 3, 1, "riding on roads, darkness, no helmet"),
 "go-for-a-drive": ("road traffic injury", "low", 4, 4, 1, "fatigue, alcohol, phone use"),
 "take-a-taxi": ("road traffic injury", "very low", 4, 4, 1, "none specific to you"),
 "go-for-a-run": ("heat illness", "very low; higher in midday heat", 3, 3, 1, "midday heat and humidity"),
 "go-hiking": ("injury, heat illness, getting lost", "low", 3, 3, 1, "hiking alone, heat, no water"),
 "climb": ("fall injury", "low", 3, 3, 1, "belay errors, fatigue"),
 "martial-arts-class": ("injury", "low", 3, 2, 1, "hard sparring"),
 "play-rugby": ("injury", "low", 3, 3, 1, "tackles"),
 "have-a-drink": ("accident or health harm", "low per occasion; repeated", 3, 3, 1, "quantity, then driving or swimming"),
 "invest": ("financial loss", "unknown", 3, 2, 0, "leverage, concentration"),
 "go-camping": ("injury or weather exposure", "low", 3, 3, 0, "storms, remote sites"),
 "go-ice-skating": ("fall injury", "low", 3, 2, 1, "falls"),
 "post-an-update-online": ("reputational harm", "low", 2, 3, 1, "tone, permanence"),
 "submit-the-work": ("reputational harm", "very low", 2, 2, 0, "errors in public work"),
 "go-scuba-diving": ("drowning or decompression injury", "low", 4, 4, 1, "diving beyond training, equipment faults, no buddy"),
 "go-surfing": ("drowning or impact injury", "low", 4, 3, 1, "rip currents, reef breaks, surfing alone"),
 "go-snorkelling": ("drowning", "low", 4, 4, 1, "currents, boat traffic, snorkelling alone"),
 "go-paddleboarding": ("drowning", "very low", 4, 4, 1, "offshore wind, no leash or buoyancy aid"),
 "go-sailing": ("drowning", "low", 4, 4, 1, "squalls, capsizing without a buoyancy aid"),
 "go-for-a-swim-at-the-beach": ("drowning", "low", 4, 4, 1, "currents, swimming alone, storms"),
 "learn-to-swim": ("drowning", "very low (supervised lessons)", 4, 4, 1, "unsupervised practice"),
 "go-rock-climbing-outdoors": ("fall injury", "low", 4, 4, 1, "anchor or belay errors, loose rock"),
 "go-horse-riding": ("fall injury", "low", 4, 3, 1, "falls, no helmet"),
 "go-mountain-biking": ("crash injury", "low", 3, 3, 1, "speed on technical trails, riding alone"),
 "go-skateboarding": ("fall injury", "low", 3, 2, 1, "falls without a helmet"),
 "go-rollerblading": ("fall injury", "low", 3, 2, 1, "falls without protection"),
 "cycle-to-work": ("road traffic injury", "low", 4, 3, 1, "riding on roads, darkness, no helmet"),
 "take-a-bike-share-bike": ("road traffic injury", "low", 4, 3, 1, "riding on roads, no helmet"),
 "drive-to-work": ("road traffic injury", "low", 4, 4, 1, "fatigue, phone use, speed"),
 "go-on-a-road-trip": ("road traffic injury", "low", 4, 4, 1, "long hours of driving, fatigue"),
 "learn-to-drive": ("road traffic injury", "low", 4, 4, 1, "inexperience"),
 "learn-to-ride-a-motorcycle": ("road traffic injury", "low per trip; higher than a car", 4, 4, 1, "inexperience, traffic, no protective gear"),
 "go-for-a-long-run": ("heat illness", "very low; higher in midday heat", 3, 3, 1, "midday heat and humidity"),
 "do-crossfit": ("musculoskeletal injury", "low", 3, 2, 1, "heavy lifts under fatigue"),
 "do-boxing-training": ("head injury", "low", 3, 3, 1, "hard sparring"),
 "smoke-a-cigarette": ("serious smoking-related disease", "high over repeated exposure", 4, 3, 1, "every cigarette adds to cumulative exposure"),
 "have-elective-surgery": ("surgical complications", "low", 4, 4, 0, "anaesthesia, infection, individual risk factors"),
 "start-a-business": ("financial loss", "unknown", 3, 2, 0, "personal guarantees, borrowing"),
 "buy-a-home": ("financial overextension", "unknown", 3, 3, 0, "a loan sized to best-case income"),
 "quit-a-job": ("income loss", "unknown", 3, 2, 0, "no savings buffer or next role"),
 "travel-solo": ("personal safety incident", "unknown", 3, 3, 0, "unfamiliar places at night, no one knows your plans"),
}

# Related actions to avoid: name | aliases | related ids | ruin tuple | why | safer | hours (when it is most relevant) | facts
AVOID = [
 ("Swim alone in open water", "swim alone,sea swim alone,open water alone", "swim,go-for-a-swim-in-the-sea,go-for-a-swim-at-the-beach,go-snorkelling",
  ("drowning", "unknown; materially higher than a supervised pool", 4, 4, 1, "no one to raise the alarm, currents"),
  "Same goal as swimming, but with no one to help if something goes wrong.", "swim", "6-20", "joy=3 hea=3 tail=0 dn=1"),
 ("Swim after drinking", "drink and swim,swim drunk", "swim,have-a-drink",
  ("drowning", "unknown; alcohol raises it", 4, 4, 1, "alcohol impairs judgement and coordination"),
  "Two ordinary actions whose combination creates a catastrophic tail.", "rest", "18-26", "joy=3 hea=0 tail=0 dn=2"),
 ("Drive after drinking", "drink driving,drunk driving,drive home after drinks", "have-a-drink,go-for-a-drive,drive-to-work,go-on-a-road-trip",
  ("road death, legal", "low per trip; repeated exposure", 4, 4, 1, "any alcohol before driving"),
  "Small per-trip probability, repeated across trips, with irreversible and legal consequences.", "take-a-taxi", "19-27", "joy=1 tail=0 dn=3"),
 ("Text while driving", "phone while driving,texting and driving", "go-for-a-drive,drive-to-work,send-a-text-message",
  ("road death", "low per trip; repeated exposure", 4, 4, 1, "eyes off the road"),
  "The message rarely matters; the tail is permanent.", "take-public-transport", "0-24", "joy=1 soc=1 tail=0 dn=2"),
 ("Drive while exhausted", "drowsy driving,drive tired", "go-for-a-drive,go-on-a-road-trip,stay-up-late",
  ("road death", "low per trip; higher when sleep-deprived", 4, 4, 1, "micro-sleeps"),
  "Fatigue is invisible to the driver until the micro-sleep.", "take-a-taxi", "21-30", "tail=0 dn=2"),
 ("Cycle on roads at night without lights", "cycle at night,no bike lights", "cycle,cycle-to-work,take-a-bike-share-bike",
  ("road traffic injury", "unknown; higher than daytime with lights", 4, 4, 1, "drivers cannot see you"),
  "Same exercise benefit is available with lights or on a park connector.", "cycle", "19-31", "hea=3 joy=2 tail=0 dn=2"),
 ("Run hard in the midday heat", "run at noon,run in the heat,midday run", "go-for-a-run,go-for-a-long-run,go-hiking",
  ("heat stroke", "low; higher in tropical midday heat", 4, 3, 1, "high heat and humidity, dehydration"),
  "In Singapore the same run in the early morning or evening keeps the benefit and drops most of the heat tail.", "go-for-a-run", "11-16", "hea=3 tail=0 dn=2"),
 ("Hike alone without telling anyone", "solo hike,hike alone", "go-hiking,walk-in-nature,go-rock-climbing-outdoors",
  ("injury with no rescue", "low; unknown", 4, 3, 1, "a fall with no one knowing where you are"),
  "Telling someone your route costs a minute and caps the tail.", "walk-in-nature", "6-19", "hea=3 joy=3 tail=0 dn=1"),
 ("Swim in the sea during a thunderstorm", "swim in storm,beach in lightning", "go-for-a-swim-in-the-sea,go-to-the-beach,swim",
  ("lightning strike, drowning", "low; Singapore has frequent lightning", 4, 4, 1, "storms, which in Singapore are often afternoon"),
  "Outdoor water during lightning combines two catastrophic tails.", "stay-home", "13-19", "joy=2 tail=0 dn=2"),
 ("Lift heavy without warming up", "max lift cold,ego lift", "strength-training,go-to-the-gym",
  ("musculoskeletal injury", "unknown", 3, 2, 1, "cold tissue, poor form, fatigue"),
  "The warm-up is cheap; the injury can cost months.", "do-mobility-work", "6-23", "hea=3 tail=0 dn=2"),
 ("Exercise through sharp pain", "train through pain,ignore pain", "go-to-the-gym,go-for-a-run,strength-training",
  ("injury", "unknown", 3, 3, 1, "sharp or unusual pain"),
  "Stopping keeps nearly all of the long-run benefit.", "rest", "0-24", "hea=1 tail=0 dn=3"),
 ("Ignore chest pain", "chest pain,ignore symptoms", "rest,book-a-doctors-appointment",
  ("severe health event", "unknown", 4, 4, 0, "chest pain, breathlessness, sudden weakness"),
  "Waiting changes nothing if it is benign and can be irreversible if it is not.", "seek-urgent-medical-care", "0-24", "tail=0 dn=3"),
 ("Skip your medication", "skip meds,miss medication", "take-your-medication",
  ("health deterioration", "depends on the medicine", 3, 3, 1, "prescribed daily medicine"),
  "Taking it is a two-minute action with a large protected downside.", "take-your-medication", "0-24", "tail=0 dn=2"),
 ("Mix medication with alcohol", "alcohol and meds,drink on medication", "have-a-drink,take-your-medication",
  ("adverse interaction", "unknown; depends on the medicine", 4, 3, 1, "sedatives, painkillers, some antibiotics"),
  "Check the label or ask a pharmacist first.", "drink-water", "18-26", "joy=2 tail=0 dn=2"),
 ("Leave the stove on and go out", "stove on,leave cooking unattended", "cook-dinner,cook-lunch",
  ("fire", "very low; repeated", 4, 4, 1, "unattended heat"),
  "A two-second check removes a catastrophic tail.", "cook-dinner", "11-21", "tail=0 dn=1"),
 ("Send an angry email", "angry email,rage email,reply angry", "reply-to-email,write-a-difficult-email",
  ("relationship and reputational harm", "moderate", 3, 3, 1, "writing while angry; cannot be unsent"),
  "Drafting now and sending tomorrow keeps every option.", "write-in-a-journal", "0-24", "car=0 soc=0 tail=0 dn=3"),
 ("Post something inflammatory online", "flame,inflammatory post,rant online", "post-an-update-online,scroll-social-media",
  ("permanent reputational harm", "low to moderate", 3, 4, 1, "screenshots persist"),
  "The upside is small and brief; the record is permanent.", "write-in-a-journal", "0-24", "joy=1 tail=0 dn=3"),
 ("Invest borrowed money in a speculative asset", "leverage,margin trading,crypto on credit,borrow to invest", "invest,buy-a-lottery-ticket",
  ("catastrophic financial loss", "unknown", 4, 3, 0, "leverage turns a drawdown into a debt"),
  "Unlevered, diversified saving keeps most upside without the ruin path.", "set-up-a-savings-plan", "0-24", "fin=1 tail=3 dn=4"),
 ("Gamble to win back losses", "chase losses,win it back", "buy-a-lottery-ticket",
  ("escalating financial loss", "moderate once chasing starts", 4, 3, 1, "chasing"),
  "Negative expected value, repeated, with an absorbing bottom.", "save-the-money", "0-24", "joy=1 tail=1 dn=4"),
 ("Take on high-interest debt for a purchase", "buy now pay later,credit card debt,finance a gadget", "buy-this,buy-a-new-phone,buy-a-car,buy-a-laptop",
  ("compounding debt", "moderate if the balance rolls over", 3, 2, 1, "interest compounding against you"),
  "Waiting or buying second-hand keeps the item within reach without the tail.", "wait-24-hours-before-buying", "0-24", "joy=2 tail=0 dn=3"),
 ("Sign a contract without reading it", "sign without reading,click agree", "fill-in-a-form,buy-furniture,subscribe-to-a-service",
  ("legal or financial lock-in", "low", 3, 3, 1, "auto-renewals, penalties, liability clauses"),
  "Reading the key clauses is cheap relative to the lock-in.", "read-the-contract-carefully", "0-24", "tail=0 dn=2"),
 ("Click a suspicious link", "phishing,scam link,suspicious sms", "check-your-phone,reply-to-email,reply-to-messages",
  ("account takeover, financial loss", "low per message; repeated", 3, 2, 1, "urgent messages asking you to log in or pay"),
  "Going to the site directly costs seconds.", "change-your-password", "0-24", "tail=0 dn=2"),
 ("Quit your job impulsively", "rage quit,quit now", "apply-for-a-job,stop-working-for-the-day",
  ("income loss", "high if no plan", 3, 3, 0, "a bad day"),
  "Searching while employed keeps the same upside with a floor.", "apply-for-a-job", "0-24", "car=1 tail=2 dn=3"),
 ("Make a major decision while exhausted or angry", "decide angry,decide tired", "make-a-decision,resolve-a-conflict",
  ("irreversible commitment", "moderate", 3, 3, 1, "fatigue, anger"),
  "Sleeping on it is reversible; many major decisions are not.", "sleep-on-it", "20-30", "tail=0 dn=2"),
 ("Doomscroll past midnight", "scroll in bed,late night scrolling", "scroll-social-media,stay-up-late",
  ("sleep loss (not ruin)", "high", 1, 1, 1, "phone in bed"),
  "Not dangerous, just poor payoff: little upside and it taxes tomorrow.", "wind-down-for-bed", "23-27", "joy=1 rec=0 hea=0 tail=0 dn=1"),
 ("Stay up all night before a big day", "all nighter,all-nighter", "stay-up-late,study-for-an-exam",
  ("performance collapse (not ruin)", "high", 2, 1, 0, "the big day itself"),
  "Poor payoff rather than ruin: sleep usually beats the extra hours.", "go-to-bed-early", "21-29", "car=1 tail=0 dn=2"),
]



# ATUS crosswalk for actions whose line does not set atus=. Code -> the ATUS group this action falls in.
ATUS_MAP = {
    "swim": "130132", "go-for-a-walk": "130131", "go-for-a-run": "130124", "cycle": "130104", "go-to-the-gym": "130134",
    "strength-training": "130133", "do-yoga": "130136", "go-hiking": "130116", "walk-in-nature": "130116", "climb": "130108",
    "dance": "130109", "martial-arts-class": "130119", "row": "130128", "go-fishing": "130112", "go-kayaking": "130132",
    "go-for-a-swim-in-the-sea": "130132", "play-a-sport": "1301", "do-a-hiit-workout": "130134", "do-bodyweight-exercises": "130134",
    "walk-to-work": "130131", "take-a-walk-after-eating": "130131", "play-with-your-dog": "0206", "stretch": "130134",
    "do-mobility-work": "130134", "pilates": "130134",
    "sleep": "0101", "nap": "0101", "go-to-bed-early": "0101", "lie-in": "0101", "rest": "120301", "rest-in-silence": "120301",
    "take-a-shower": "0102", "brush-and-floss": "0102", "do-skincare": "0102", "get-a-haircut": "0805", "get-a-massage": "0805",
    "see-a-dentist": "0804", "get-a-health-check-up": "0804", "book-a-doctors-appointment": "0209", "refill-your-prescription": "0804",
    "take-your-medication": "0103", "seek-urgent-medical-care": "0804",
    "eat-dinner": "1101", "eat-lunch": "1101", "eat-breakfast": "1101", "eat-out": "1101", "try-a-new-restaurant": "1101",
    "cook-dinner": "020201", "cook-lunch": "020201", "meal-prep": "020201", "do-the-dishes": "020203", "do-the-laundry": "020102",
    "fold-the-laundry": "020102", "iron-clothes": "020102", "clean-your-room": "020101", "vacuum": "020101", "mop-the-floor": "020101",
    "clean-the-bathroom": "020101", "clean-the-kitchen": "020203", "declutter": "020101", "organise-a-cupboard": "020104",
    "fix-something-broken": "0203", "garden": "020501", "water-the-plants": "020501", "feed-the-pet": "0206",
    "go-grocery-shopping": "070101", "go-to-the-bank": "0802", "fill-up-petrol": "070102", "get-the-car-serviced": "0207",
    "pay-your-bills": "020901", "make-a-budget": "020901", "check-your-bank-account": "020901", "do-your-taxes": "020901",
    "invest": "020901", "sort-your-paperwork": "020902", "plan-tomorrow": "020902", "write-a-plan": "020902",
    "watch-tv": "120303", "watch-a-film": "120303", "watch-sport": "120303", "play-video-games": "120307",
    "play-a-board-game": "120307", "do-a-puzzle": "120307", "read-a-book": "120312", "read-a-novel": "120312",
    "listen-to-music": "120306", "listen-to-a-podcast": "120306", "go-to-a-museum": "120402", "go-to-a-concert": "120401",
    "go-to-the-theatre": "120401", "knit-or-sew": "120309", "draw": "120309", "paint": "120309", "build-something": "120309",
    "write-something": "120313", "write-in-a-journal": "120313", "write-poetry": "120313", "make-music": "120306",
    "watch-youtube": "120308", "scroll-social-media": "120308", "browse-the-internet": "120308", "read-the-news": "120312",
    "meditate": "1401", "pray": "140102", "attend-a-religious-service": "140101", "volunteer": "15",
    "call-a-friend": "160102", "call-your-parents": "160101", "make-a-phone-call": "1601", "meet-a-friend": "1201",
    "host-dinner": "1202", "attend-a-birthday-party": "1202", "play-with-your-kids": "030103",
    "take-an-online-course": "0601", "attend-a-workshop": "0601", "study-for-an-exam": "0603", "apply-for-a-job": "0504",
    "update-your-cv": "0504",
}
DRM_MAP = {
    "nap": "Napping", "rest": "Relaxing", "rest-in-silence": "Relaxing", "meditate": "Pray/worship/meditate",
    "pray": "Pray/worship/meditate", "attend-a-religious-service": "Pray/worship/meditate", "watch-tv": "Watching TV",
    "watch-a-film": "Watching TV", "watch-sport": "Watching TV", "call-a-friend": "On the phone", "call-your-parents": "On the phone",
    "make-a-phone-call": "On the phone", "play-with-your-kids": "Taking care of my children",
    "spend-time-with-your-partner": "Intimate relations",
}
# Studies whose experiments test this action (direct) or a closely related one (related).
EVIDENCE = {
    "text-a-friend-you-have-not-spoken-to-in-a-while": [("liu2023", "direct")], "check-in-on-a-friend": [("liu2023", "direct")],
    "call-a-family-member": [("liu2023", "direct")], "check-in-on-an-older-relative": [("liu2023", "direct")],
    "email-a-former-teacher-or-mentor": [("liu2023", "direct")], "call-your-parents": [("liu2023", "related")],
    "keep-in-touch-with-an-old-colleague": [("liu2023", "related")],
    "send-a-thank-you-note": [("kumar2018", "direct")], "write-a-gratitude-letter": [("kumar2018", "direct")],
    "give-a-sincere-compliment": [("boothby2021", "direct")], "leave-a-kind-comment": [("boothby2021", "related")],
    "talk-with-a-stranger": [("epley2014", "direct")], "ask-a-deeper-question": [("kardas2022", "direct")],
    "check-email-at-set-times": [("mark2008", "related")], "batch-your-messages": [("mark2008", "related")],
    "turn-off-notifications": [("mark2008", "related")], "block-your-calendar-for-focus": [("mark2008", "related")],
    "deep-work": [("mark2008", "related")],
    "quit-a-job": [("levitt2021", "direct")], "end-a-relationship-that-is-not-working": [("levitt2021", "direct")],
    "flip-a-coin-for-a-stuck-decision": [("levitt2021", "direct")], "change-careers": [("levitt2021", "related")],
    "buy-something-with-a-free-return-window": [("gilbert2002", "direct")], "wait-24-hours-before-buying": [("gilbert2002", "related")],
    "write-down-a-plan-for-an-unfinished-task": [("masicampo2011", "direct")], "make-a-to-do-list": [("masicampo2011", "related")],
    "plan-tomorrow": [("masicampo2011", "related")], "write-down-your-worries": [("masicampo2011", "related")],
    "daydream": [("killingsworth2010", "related")], "meditate": [("killingsworth2010", "related")],
    "think-about-what-you-would-regret-not-doing": [("gilovich1995", "related"), ("richardson2023", "related")],
}
EA_DIR = Path(__file__).resolve().parent / "everyday-actions"


def load_inputs():
    here = Path(__file__).resolve().parent
    import csv
    with open(here / "atus_observed.csv", newline="", encoding="utf-8") as fh:
        atus = {r["atus_code"]: {"label": r["label"], "rate": float(r["participation_rate"]), "min": float(r["minutes_when_performed"]),
                                 "n": int(r["n_doing"]), "years": r["years"]} for r in csv.DictReader(fh)}
    with open(EA_DIR / "drm_table1.csv", newline="", encoding="utf-8") as fh:
        drm = {r["drm_label"]: {k: float(r[k]) for k in ("positive_affect", "negative_affect", "competent", "impatient", "tired")}
               for r in csv.DictReader(fh)}
    ev = json.loads((EA_DIR / "evidence.json").read_text(encoding="utf-8"))["sources"]
    studies = {k: {"citation": v["citation"], "url": v["url"], "kind": v["kind"], "finding": v.get("finding", ""),
                   "verification": v.get("verification", "")} for k, v in ev.items() if k not in ("kahneman2004", "atus2014_2016")}
    return atus, drm, studies


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def parse_hours(v):
    return [[float(a), float(b)] for a, b in (x.split(":") for x in v.split(";") if x)]


def parse_over(s):
    out = {}
    for m in re.finditer(r"(\w+)=(.*?)(?=\s+\w+=|$)", s.strip()):
        k, v = m.group(1), m.group(2).strip()
        if k in ("atus", "drm"):
            out[k] = v or None
        elif k == "dur":
            out[k] = [int(x) for x in v.split("/")]
        elif k in ("typ", "best"):
            out[k] = parse_hours(v)
        elif k in ("goals", "comp", "opp", "subs", "places"):
            out[k] = [x for x in v.split(",") if x]
        elif k == "flags":
            out[k] = v
        elif k == "open":
            out[k] = [float(x) for x in v.split("-")]
        else:
            out[k] = int(v)
    return out


SOURCES = [
    {"id": "judgement", "title": "Author judgement for this build (category priors and per-action overrides)", "type": "heuristic",
     "status": "used", "url": "", "notes": "Ordinal 0-4 estimates. Not measured. Every field that uses it is labelled JUDGEMENT."},
    {"id": "model", "title": "This page's model: formulas that transform the judged facts into fit, classes and lens rankings", "type": "model",
     "status": "used", "url": "", "notes": "Formulas are shown on the page under Method. MODEL values inherit the confidence of their inputs."},
    {"id": "singapore", "title": "Singapore context assumptions: daylight about 07:00-19:15, midday heat 11:00-16:00, typical opening hours", "type": "heuristic",
     "status": "used", "url": "", "notes": "Stored as a Singapore adjustment separate from the global prior; switch it off to see the global prior alone."},
    {"id": "personal", "title": "Your own decision history in this browser", "type": "personal",
     "status": "used when present", "url": "", "notes": "Shown with its sample size n. Not used to change rankings."},
    {"id": "onet", "title": "O*NET occupational task database", "type": "observational", "status": "planned; not retrieved (network blocked in the build environment)", "url": "", "notes": "Would ground work-task actions."},
    {"id": "atus2014_2016", "title": "American Time Use Survey microdata 2014-2016 (BLS), via the CRAN atus 0.2 mirror, commit 1049d1d", "type": "observational",
     "status": "used: participation and minutes per ATUS code, recomputed by derive_atus.py", "url": "https://github.com/cran/atus",
     "notes": "U.S. civilian population age 15+, n = 32,990 diary days, weight TUFNWGTP. Primary activity only. Time-of-day is not in this mirror, so typical-time curves stay judgement."},
    {"id": "kahneman2004", "title": "Kahneman, Krueger, Schkade, Schwarz & Stone (2004), Day Reconstruction Method, Science 306:1776, Table 1", "type": "observational",
     "status": "used: affect ratings for 16 activity groups (transcribed in visuals/everyday-actions)", "url": "https://doi.org/10.1126/science.1103572",
     "notes": "909 employed women in Texas who worked on the reference day; 0-6 ratings."},
    {"id": "oecd-tus", "title": "OECD time-use database", "type": "survey", "status": "planned; not retrieved", "url": "", "notes": "Cross-country typical durations."},
    {"id": "sg-tus", "title": "Singapore time-use survey and data.gov.sg datasets", "type": "survey", "status": "planned; not retrieved", "url": "", "notes": "Singapore-specific timing and opening hours."},
    {"id": "health-reviews", "title": "Systematic reviews on exercise, sleep, meal timing and injury risk", "type": "review", "status": "planned; not retrieved", "url": "", "notes": "Would replace judged health, timing and tail-risk fields."},
]

MODIFIERS = {
    "manner": {
        "short": {"label": "short", "suffix": ", short", "flag": "f", "note": "about half the duration; benefits x0.65, right tail x0.7, activation -1"},
        "long": {"label": "long", "suffix": ", long", "flag": "f", "note": "about 1.6x the duration; benefits x1.2, activation +1"},
        "friend": {"label": "with a friend", "suffix": " with a friend", "flag": "s", "note": "social +2, enjoyment +1, activation +1, setup +10 min"},
        "family": {"label": "with family", "suffix": " with family", "flag": "s", "note": "social +2, enjoyment +0.5, activation +1, setup +10 min"},
        "partner": {"label": "with your partner", "suffix": " with your partner", "flag": "s", "note": "social +2, enjoyment +1, activation +0.5"},
        "alone": {"label": "alone", "suffix": " alone", "flag": "s", "note": "social 0, activation -0.5, recovery +0.5"},
        "gym": {"label": "at the gym", "suffix": " at the gym", "place": 1, "note": "setup +15 min, money +1"},
        "outside": {"label": "outside", "suffix": " outside", "place": 1, "note": "outdoor: daylight and heat adjustments apply; setup +5 min"},
        "home": {"label": "at home", "suffix": " at home", "place": 1, "note": "setup at most 2 min, no money cost, indoor"},
        "park": {"label": "in the park", "suffix": " in the park", "place": 1, "note": "outdoor, setup +10 min, recovery +0.5"},
        "office": {"label": "at the office", "suffix": " at the office", "place": 1, "note": "setup +20 min"},
        "cafe": {"label": "at a café", "suffix": " at a café", "place": 1, "note": "setup +15 min, money +1, novelty +1"},
        "library": {"label": "at the library", "suffix": " at the library", "place": 1, "note": "setup +20 min, work and learning +0.5"},
        "restaurant": {"label": "at a restaurant", "suffix": " at a restaurant", "place": 1, "note": "setup +15 min, money +2, enjoyment +1"},
    },
    "time": {
        "now": {"label": "now", "suffix": ""},
        "morning": {"label": "this morning", "suffix": " this morning", "hour": 8},
        "lunch": {"label": "at lunch", "suffix": " at lunch", "hour": 12.5},
        "afternoon": {"label": "this afternoon", "suffix": " this afternoon", "hour": 15.5},
        "evening": {"label": "this evening", "suffix": " this evening", "hour": 19},
        "tonight": {"label": "tonight", "suffix": " tonight", "hour": 21.5},
        "tomorrow": {"label": "tomorrow", "suffix": " tomorrow", "delay": 24},
        "weekend": {"label": "this weekend", "suffix": " this weekend", "delay": 48, "hour": 10},
    },
}


def main():
    bases = []
    cat = None
    for line in ACTIONS.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            cat = line[1:]
            continue
        parts = [p.strip() for p in line.split("|")]
        name, aliases, over = parts[0], parts[1], parts[2] if len(parts) > 2 else ""
        bases.append((name, cat, [a.strip() for a in aliases.split(",") if a.strip()], parse_over(over)))
    for obj, price, al in PURCHASE_OBJECTS:
        bases.append((f"Buy {obj}", "purchases", [x.strip() for x in al.split(",")],
                      dict(money=price, dur=[15, 40, 120] if price >= 3 else [5, 15, 30], rev=2 if price >= 3 else 3)))
    for sp in SPORTS:
        bases.append((f"Play {sp}", "exercise", [sp, f"{sp} game"],
                      dict(dur=[45, 75, 120], setup=20, soc=3, joy=4, dn=2, phys=3, nov=1, atus=SPORT_ATUS.get(sp, "1301"),
                           goals=["fitness", "exercise", "connection"], flags="s", places=["outside", "gym"])))
    for sub in SUBJECTS:
        bases.append((f"Study {sub}", "learning", [sub, f"learn {sub}"], dict()))
    for lang in LANGUAGES:
        bases.append((f"Study {lang}", "learning", [lang.lower(), f"learn {lang.lower()}", f"{lang.lower()} lesson"],
                      dict(soc=1, nov=2, lt=4, freq=1)))
    for ins in INSTRUMENTS:
        bases.append((f"Practise the {ins}", "learning", [ins, f"{ins} practice", f"play {ins}", f"practice {ins}"],
                      dict(joy=3, lrn=4, lt=4, cog=3, atus="120306", goals=["music", "skill", "learning"])))
    for skill, c in SKILLS:
        bases.append((f"Learn to {skill}", c, [f"learn how to {skill}", f"{skill} lessons"],
                      dict(lrn=4, lt=4, nov=3, info=3, opt=3, act=3, freq=0)))
    for place, out, day in SG_PLACES:
        over = dict(dur=[60, 120, 180], setup=30, money=1, joy=3, nov=3, rec=3, sg=1, out=out, day=day,
                    goals=["exploration", "leisure", "singapore"])
        if not out:
            over["open"] = [10, 19] if "Museum" in place or "Centre" in place else [10, 22]
        bases.append((f"Visit {place}", "travel", [place.lower().replace("the ", "")], over))
    for dish in DISHES:
        bases.append((f"Cook {dish}", "cooking", [dish.lower()], dict(joy=3, lrn=1)))
    for dest in DESTINATIONS:
        bases.append((f"Take a trip to {dest}", "travel", [dest.lower(), f"holiday in {dest.lower()}", f"go to {dest.lower()}"],
                      dict(dur=[2880, 7200, 14400], setup=240, money=4, joy=4, nov=4, info=3, rec=4, tail=2, phys=1)))
    for name, al, c, over in HOBBIES:
        bases.append((name, c, [x.strip() for x in al.split(",")], parse_over(over)))

    extra = {}
    for line in EXTRA.strip().splitlines():
        aid, rest = line.split(" ", 1)
        extra.setdefault(aid, {}).update(parse_over(rest))
    for name, al, rel, ruin, why, safer, hours, facts in AVOID:
        over = parse_over(facts)
        over.update(dur=[5, 30, 90], act=1, rev=1, unc=3, freq=1, ev=1, lt=0, opt=0, info=0, reg=0, decay=0, rec=0, nov=1)
        over.update(parse_over(facts))
        bases.append((name, "avoid", [x.strip() for x in al.split(",")], dict(over, _avoid=dict(rel=rel.split(","), why=why, safer=safer, when=[float(x) for x in hours.split("-")]), _ruin=ruin)))
    out_actions = []
    seen = set()
    for name, c, aliases, over in bases:
        pri = CATS[c]
        aid = slug(name)
        assert aid not in seen, aid
        seen.add(aid)
        if aid in extra:
            over = {**over, **extra.pop(aid)}
        a = {"id": aid, "name": name, "cat": c, "aliases": aliases}
        for f in FIELDS:
            if f in over:
                a[f] = over[f]
            elif f in pri:
                a[f] = pri[f]
        if "best" in a and "evt" not in a:
            a["evt"] = pri.get("evt", 1)
        a["goals"] = over.get("goals", pri["goals"].split(","))
        a["flags"] = over.get("flags", pri["flags"])
        a["places"] = over.get("places", [p for p in pri["places"].split(",") if p])
        if "places" not in over and ("open" in a or a["setup"] >= 15):
            a["places"] = []
        if "subs" in over:
            a["subs"] = over["subs"]
        a["comp"] = over.get("comp", [p for p in pri["comp"].split(",") if p])
        a["opp"] = over.get("opp", [p for p in pri["opp"].split(",") if p])
        a["own"] = sorted(k for k in over if k in FIELDS)
        r = over.get("_ruin") or RUIN.get(aid)
        if r:
            a["ruin"] = dict(kind=r[0], p=r[1], sev=r[2], irrev=r[3], rep=bool(r[4]), trig=r[5])
        if "_avoid" in over:
            a["avoid"] = over["_avoid"]
        if aid in ATUS_MAP and "atus" not in over:
            a["atus"] = ATUS_MAP[aid]
            a["own"].append("atus")
        if aid in DRM_MAP and "drm" not in over:
            a["drm"] = DRM_MAP[aid]
            a["own"].append("drm")
        a["own"].sort()
        if a.get("atus") is None:
            a.pop("atus", None)
        if a.get("drm") is None:
            a.pop("drm", None)
        if aid in EVIDENCE:
            a["cites"] = [{"id": i, "rel": r} for i, r in EVIDENCE[aid]]
        out_actions.append(a)

    assert not extra, extra
    assert set(RUIN) <= seen, set(RUIN) - seen
    ids = {a["id"] for a in out_actions}
    for a in out_actions:
        if "avoid" in a:
            assert all(r in ids for r in a["avoid"]["rel"]), (a["id"], a["avoid"]["rel"])
            assert a["avoid"]["safer"] in ids, a["avoid"]["safer"]
    for a in out_actions:
        for k in ("comp", "opp", "subs"):
            a[k] = [x for x in a.get(k, []) if x in ids and x != a["id"]]
            if not a[k]:
                a.pop(k, None)
    missing = sorted({x for n, c, al, o in bases for k in ("comp", "opp", "subs") for x in o.get(k, []) if x not in ids})
    cats_missing = sorted({x for c in CATS.values() for k in ("comp", "opp") for x in c[k].split(",") if x and x not in ids})
    assert not missing and not cats_missing, (missing, cats_missing)

    atus, drm, studies = load_inputs()
    for a in out_actions:
        assert a.get("atus") is None or a["atus"] in atus, (a["id"], a.get("atus"))
        assert a.get("drm") is None or a["drm"] in drm, (a["id"], a.get("drm"))
        assert all(c["id"] in studies for c in a.get("cites", [])), a["id"]
    assert set(EVIDENCE) <= ids and set(ATUS_MAP) <= ids and set(DRM_MAP) <= ids, (set(EVIDENCE) - ids, set(ATUS_MAP) - ids, set(DRM_MAP) - ids)
    cats = {k: {kk: vv for kk, vv in v.items() if kk in ("label",)} for k, v in CATS.items()}
    for k, v in CATS.items():
        cats[k]["prior"] = {f: v[f] for f in FIELDS if f in v}
    return {"topic": "Convexity Action Engine: an ordinal, judgement-labelled atlas of everyday actions",
            "scales": "0-4 ordinal unless stated; durations in minutes; hours are Singapore local time (may exceed 24 to mean after midnight)",
            "sources": SOURCES, "modifiers": MODIFIERS, "categories": cats, "actions": out_actions,
            "observed": atus, "drm": drm, "studies": studies}


def write():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(main(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write()
