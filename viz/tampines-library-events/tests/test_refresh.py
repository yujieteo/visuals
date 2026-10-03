"""refresh.py offline: how NLB's listing becomes data.json, without the network.

The records below are cut down from NLB's EventFilter response and GoLibrary (LibCal) pages as retrieved on
2026-10-03: the fields refresh.py reads, with their published values.
"""
import argparse
import io
import json
import shutil
import sys
import tempfile
import unittest
from unittest import mock
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import onepa  # noqa: E402
import refresh  # noqa: E402
import refresh_kit  # noqa: E402


def raw(event_id, title, kind="Workshop", subjects=("Technology",), description="", link=None, **extra):
    record = {
        "eventId": event_id, "title": title, "link": link or f"https://nlb.libcal.com/event/{event_id}",
        "isFree": True, "isOnline": False, "branchCode": "TRL", "branchName": "Tampines Library",
        "location": {"venue": "Tampines Library - MakeIT (Level 4)", "address": "1 Tampines Walk Our Tampines Hub #02-01 Singapore 528523"},
        "nlbEventType": {"code": "T", "name": kind}, "nlbSubjects": [{"code": "S", "name": s} for s in subjects],
        "nlbTargetAudiences": [{"code": "A05", "name": "Teenagers (13-17 yo)"}], "nlbLanguage": None,
        "eventDate": {"startDateTime": "2026-10-04T15:00:00", "endDateTime": "2026-10-04T17:30:00"},
        "stringEventStartDate": "Sun, 04 Oct 2026", "stringEventEndDate": "Sun, 04 Oct 2026", "stringEventTimeRange": "15:00 - 17:30",
        "description": description,
    }
    record.update(extra)
    return record


LASER = raw("5974092", "Laser Cutting Starter Session @ Tampines Library | MakeIT", description=(
    "<p><b>About the Event</b></p><p>Begin your laser cutting journey with this introductory, hands-on learning session "
    "that teaches you how to use our laser cutters at MakeIT.</p><p>This session is suitable for beginners.&nbsp;</p>"
    "<p>. This programme is suitable for participants aged 13 and above.</p><p><strong>Registration and Attendance</strong></p>"
    "<ul><li>Registration is required for this programme.</li></ul>"))
EAT = raw("5975969", "Come, Let's Eat | TOYLC26", subjects=("Health",), description=(
    "<p>About the Event</p><p>Join us at Come, Let&rsquo;s Eat, an interactive community education session to:<br>"
    "- Experience soft meal demonstration and tasting</p><p>This programme is suitable for seniors.</p>"))
CYANOTYPE = raw("5975401", "Herbs, Spices and Stories: A Cyanotype Workshop | TOYLC26", subjects=("Art & Creativity", "Reading"), description=(
    "<p>Participants will read selected texts on food, memory and home, then create their own cyanotype prints using culinary herbs.</p>"))
STORY = raw("5863211", "Storytime for 4-6 years old @ Tampines Library | Early READ", kind="Storytelling", subjects=("Reading",))
TALK = raw("5975405", "AI Social robots entering our living room! | TOYLC26", kind="Talk")
RHYME = raw("5871520", "Jiggle, Read & Rhyme", subjects=("Reading",))

WAITLIST = ('<script type="application/ld+json">{"@type":"Event","eventStatus":"https://schema.org/EventScheduled"}</script>'
            '<p class="s-lc-event-registration-required">\n Registration is required. There are no seats available but a waiting list is available. '
            'Before registering, please ensure your email address is up-to-date on your NLB account.\n</p>')
SEATS = '<p class="s-lc-event-registration-required">Registration is required. There are 21 seats available. Before registering, please check.</p>'
FULL = '<div class="row" id="s-lc-event-reg-req-full">\n<div class="col-md-12 s-lc-event-txt">Registrations are fully booked!</div>'
NOT_OPEN = '</dl>\n<div class="col-md-5"><div class="alert alert-info">Registrations open at  12:00 PM Saturday, October 10, 2026</div></div>'
CANCELLED = ('<script type="application/ld+json">{"@type":"Event","eventStatus":"https://schema.org/EventCancelled"}</script>' + SEATS)


class Categorise(unittest.TestCase):
    def kind(self, record):
        return refresh.categorise(record, refresh.plain(record["description"]))[0]

    def test_maker_cooking_and_hands_on_classes_are_kept(self):
        self.assertEqual(self.kind(LASER), "maker")
        self.assertEqual(self.kind(EAT), "cooking", "a meal demonstration is a food class")
        self.assertEqual(self.kind(CYANOTYPE), "hands-on", "culinary herbs in an art workshop do not make it a cooking class")

    def test_talks_storytelling_and_reading_workshops_are_left_out(self):
        for record in (STORY, TALK, RHYME):
            self.assertIsNone(self.kind(record), record["title"])
        self.assertEqual(refresh.categorise(TALK, "")[1], "event type Talk")

    def test_online_classes_are_left_out(self):
        self.assertIsNone(self.kind({**LASER, "isOnline": True}))


class Fields(unittest.TestCase):
    def test_an_event_keeps_the_published_values_and_drops_missing_ones(self):
        item = refresh.event(LASER, "maker", "Laser, MakeIT")
        self.assertEqual(item["booking_url"], LASER["link"], "the booking link is the listing's own")
        self.assertEqual(item["start"], "2026-10-04T15:00:00+08:00")
        self.assertEqual(item["duration_minutes"], 150)
        self.assertEqual(item["age_note"], "This programme is suitable for participants aged 13 and above.",
                         "a sentence on ages, not 'suitable for beginners'")
        self.assertTrue(item["description"].startswith("Begin your laser cutting journey"), "no 'About the Event' heading")
        self.assertNotIn("Registration and Attendance", item["description"])
        self.assertNotIn("language", item, "NLB gave no language, so none is recorded")
        self.assertNotIn("end_date_label", item, "a one-day class has no separate end date")

    def test_descriptions_are_cut_at_a_sentence(self):
        text = "First sentence is here. " * 40
        short = refresh.short_description(text)
        self.assertLessEqual(len(short), 420)
        self.assertTrue(short.endswith("."))

    def test_age_note_needs_an_age(self):
        self.assertIsNone(refresh.age_note("This session is suitable for beginners."))
        self.assertEqual(refresh.age_note("This programme is suitable for seniors."), "This programme is suitable for seniors.")


class Registration(unittest.TestCase):
    def test_notices_on_golibrary_pages(self):
        self.assertEqual(refresh.registration(WAITLIST), {"status": "waitlist",
                         "note": "Registration is required. There are no seats available but a waiting list is available."})
        self.assertEqual(refresh.registration(SEATS), {"status": "open", "seats_left": 21,
                         "note": "Registration is required. There are 21 seats available."})
        self.assertEqual(refresh.registration(FULL), {"status": "full", "note": "Registrations are fully booked!"})
        self.assertEqual(refresh.registration(NOT_OPEN), {"status": "not-open", "note": "Registrations open at 12:00 PM Saturday, October 10, 2026"})
        self.assertEqual(refresh.registration(CANCELLED)["status"], "cancelled")
        self.assertEqual(refresh.registration("<html>no notice</html>"), {}, "nothing published, nothing recorded")


class Build(unittest.TestCase):
    def test_build_keeps_classes_lists_the_rest_and_never_invents_links(self):
        stray = raw("1", "3D Starter Session", link="https://example.com/register")
        nlb = refresh.build_nlb([STORY, LASER, EAT, TALK, stray], {"5974092": {"status": "waitlist"}})
        data = refresh.build(nlb, ([], {"id": "onepa", "listed": 0, "kept": 0}), datetime.fromisoformat("2026-10-03T13:20:37+08:00"))
        source = data["sources"][0]
        self.assertEqual((source["id"], source["listed"], source["kept"]), ("nlb", 5, 3))
        self.assertEqual([e["id"] for e in data["events"]], ["1", "5974092", "5975969"])
        self.assertEqual({x["id"] for x in source["excluded"]}, {"5863211", "5975405"})
        self.assertNotIn("booking_url", data["events"][0], "a link outside NLB's own sites is dropped, not replaced")
        self.assertEqual(data["events"][1]["registration"], {"status": "waitlist"})
        self.assertEqual({(e["source"], e["organiser"], e["venue_group"]) for e in data["events"]}, {("nlb", "NLB", "Tampines Regional Library")})
        self.assertEqual(data["retrieved"], "2026-10-03T13:20:37+08:00")
        self.assertEqual(source["api_query"]["filter"]["Location"], ["TRL"])


# onePA, cut down from its search results and pages as retrieved on 2026-10-03: the fields onepa.py reads.
OUTLETS = {"data": [
    {"title": "Tampines East CC", "type": "CC", "url": "/cc/tampines-east-cc", "address": "10,Tampines Street 23,"},
    {"title": "Tampines Arcadia RN", "type": "RC", "url": "/rc/tampines-arcadia-rn"},
    {"title": "Pasir Ris East CC", "type": "CC", "url": "/cc/pasir-ris-east-cc"},
    {"title": "Our Tampines Hub", "type": "CC", "url": "/cc/our-tampines-hub"},
]}
BREAD = {"type": "Course", "name": "Breadmaking", "product_code": "C027244088", "outlet_name": "Tampines East CC",
         "categories_level_1": ["Lifestyle & Leisure"], "categories_level_2": "Pastry & Baking", "categories_level_3": "Bread",
         "start_date": "2026-11-16T10:30:00+00:00", "end_date": "2026-11-16T13:00:00+00:00", "min_price": 40, "max_price": 45,
         "description": "The course enables participants to create a variety of breads, buns and rolls at home.",
         "xp": {"Class": {"Id": "1f3bd38a-5cab-f111-8520-06e3b3530da0", "RequirementsAndRemarks": "Class is for 10yrs and above\nMenu\nMaterial and Ingredient Fee of $8 payable to Trainer"},
                "ClassFees": [{"ClassFeeAmount": "40.0000", "ClassFeeName": "Passion Member"}, {"ClassFeeAmount": "45.0000", "ClassFeeName": "Non Passion Member"}]}}
WEEKLY = {**BREAD, "name": "Variety Cooking Workshop for Adults", "product_code": "C027245039", "categories_level_2": "Culinary",
          "start_date": "2026-10-07T19:00:00+00:00", "end_date": "2026-11-11T21:00:00+00:00", "xp": {"Class": {"Id": "7cfee22b"}}}
RECIPES = {"type": "Event", "name": "Tampines Changkat CC IAEC - Recipe Sharing IG (25 October 2026)", "id": "PA-Event-43720360",
           "event_product_ref_code": "43720360", "outlet_name": "Tampines Changkat CC", "categories_level_1": ["Active Ageing"],
           "start_date": "2026-10-25T11:00:00+00:00", "end_date": "2026-10-25T13:00:00+00:00", "min_price": 0, "max_price": 0}
ZUMBA = {"type": "Course", "name": "Zumba Fitness (HealthierSG)", "product_code": "C027240001", "outlet_name": "Tampines East CC",
         "categories_level_2": "Dance Fitness"}
SITEMAP = ("<urlset><url><loc>https://www.onepa.gov.sg/courses/breadmaking-c027244088</loc></url>"
           "<url><loc>https://www.onepa.gov.sg/events/tampines-changkat-cc-iaec-recipe-sharing-ig-25-october-2026-43720360</loc></url></urlset>")


def page(product_id, props):
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps({"props": {"pageProps": {"productId": product_id, **props}}})}</script>'


BREAD_PAGE = page("c027244088", {"fields": {"ClassSessions": {"value": json.dumps([
    {"startTime": "2026-11-16T10:30:00", "endTime": "2026-11-16T11:00:00", "internalVenue": "CULINARY STUDIO", "externalVenue": ""}])}},
    "Class": {"TotalSessions": 1, "Language": "ENGLISH", "TargetCustomerSegments": ["Adults", "Children"], "CanRegisterOnline": True}})
WEEKLY_PAGE = page("c027245039", {"fields": {"ClassSessions": {"value": json.dumps([
    {"startTime": f"2026-{d}T19:00:00", "endTime": f"2026-{d}T21:00:00", "internalVenue": "", "externalVenue": "Lvl 5 Homecraft Room"}
    for d in ("10-14", "10-07", "11-11")])}}, "Class": {"TotalSessions": 3}})
RECIPES_PAGE = page("43720360", {"Tickets": [{"Name": "Registration", "Price": 0, "Qty": 25, "AvailableQty": 21}],
                                 "Address": "13 Tampines Street 11, Tampines Changkat Constituency Office"})


class OnePA(unittest.TestCase):
    def test_the_tampines_clubs_are_the_community_clubs_named_tampines(self):
        self.assertEqual(onepa.tampines_clubs(OUTLETS), [
            {"name": "Our Tampines Hub", "url": "https://www.onepa.gov.sg/cc/our-tampines-hub"},
            {"name": "Tampines East CC", "url": "https://www.onepa.gov.sg/cc/tampines-east-cc", "address": "10,Tampines Street 23,"}])

    def test_the_searches_ask_for_open_courses_by_category_and_each_clubs_events(self):
        body = onepa.course_search("Pastry & Baking", "2026-10-03")
        filters = {f["name"]: f["value"] for f in body["filter"]["filters"]}
        self.assertEqual(filters, {"type": "Course", "registration_closing_date": "2026-10-03", "active": True, "categories_level_2": "Pastry & Baking"})
        self.assertEqual(body["pagination"], {"skip": 0, "take": 100})
        filters = {f["name"]: f["value"] for f in onepa.event_search("Tampines East CC", "2026-10-03", skip=100)["filter"]["filters"]}
        self.assertEqual(filters, {"type": "Event", "outlet_name": "Tampines East CC", "ticket_end_date": "2026-10-03"})

    def test_cooking_and_baking_are_kept_and_the_rest_left_out(self):
        self.assertEqual(onepa.food(BREAD), ("cooking", "Pastry & Baking"))
        self.assertEqual(onepa.food(RECIPES), ("cooking", "Recipe"))
        self.assertIsNone(onepa.food(ZUMBA)[0])

    def test_booking_links_come_from_the_published_sitemap_by_code(self):
        urls = onepa.sitemap_urls(SITEMAP)
        self.assertEqual(urls[onepa.code_of(BREAD)], "https://www.onepa.gov.sg/courses/breadmaking-c027244088")
        self.assertEqual(urls[onepa.code_of(RECIPES)], "https://www.onepa.gov.sg/events/tampines-changkat-cc-iaec-recipe-sharing-ig-25-october-2026-43720360")
        self.assertNotIn(onepa.code_of(ZUMBA), urls)

    def test_onepa_times_are_singapore_wall_clock(self):
        self.assertEqual(onepa.wall("2026-11-16T10:30:00+00:00"), "2026-11-16T10:30:00+08:00")
        self.assertEqual(onepa.wall("2026-11-16T10:30:00"), "2026-11-16T10:30:00+08:00")
        self.assertIsNone(onepa.wall(None))

    def test_a_single_session_course_keeps_its_class_times_and_published_fields(self):
        details = onepa.page_details(BREAD_PAGE, "c027244088")
        self.assertEqual(details["sessions"], [{"start": "2026-11-16T10:30:00+08:00", "end": "2026-11-16T11:00:00+08:00", "room": "CULINARY STUDIO"}])
        self.assertEqual(onepa.page_details(BREAD_PAGE, "c000000000"), {}, "another class's page adds nothing")
        e = onepa.event(BREAD, "https://www.onepa.gov.sg/courses/breadmaking-c027244088", details, (12, 12), refresh.short_description)
        self.assertEqual((e["id"], e["source"], e["organiser"], e["category"]), ("onepa-c027244088", "onepa", "onePA", "cooking"))
        self.assertEqual((e["start"], e["end"], e["duration_minutes"], e["time_label"]), ("2026-11-16T10:30:00+08:00", "2026-11-16T13:00:00+08:00", 150, "10:30 - 13:00"),
                         "the class's 10:30-13:00, not its session's shorter 10:30-11:00")
        self.assertEqual(e["fees"], [{"label": "Passion Member", "amount": 40}, {"label": "Non Passion Member", "amount": 45}])
        self.assertIs(e["free"], False)
        self.assertEqual(e["fee_note"], "Material and Ingredient Fee of $8 payable to Trainer")
        self.assertEqual(e["age_note"], "Class is for 10yrs and above")
        self.assertEqual((e["venue"], e["venue_group"], e["language"]), ("Tampines East CC - CULINARY STUDIO", "Tampines East CC", "English"))
        self.assertEqual(e["audiences"], ["Adults", "Children"])
        self.assertEqual(e["registration"], {"status": "open", "seats_left": 12, "capacity": 12, "note": "12 of 12 places available on onePA."})
        self.assertEqual(e["booking_url"], "https://www.onepa.gov.sg/courses/breadmaking-c027244088")

    def test_the_age_and_fee_notes_are_only_the_clause_that_names_them(self):
        cases = [  # remarks as onePA published them on 2026-10-03, then (age_note, fee_note)
            ("Pls bring along container and $8 ingredient fee payable to Trainer\nparent and Child (3yrs n above) will learn to make cookies",
             ("parent and Child (3yrs n above)", "Pls bring along container and $8 ingredient fee payable to Trainer")),
            ("Class is for Children Age 10yrs and above,\nKindly bring along container and $8 ingredient fee payable to Trainer",
             ("Class is for Children Age 10yrs and above", "Kindly bring along container and $8 ingredient fee payable to Trainer")),
            ("The class will last about 2 hours. Suitable for kids above 6 years old. Participants need to bring own apron, containers and "
             "carrier bags for completed products. Ingredient fee of $8.50 to be paid directly to trainer.",
             ("Suitable for kids above 6 years old", "Ingredient fee of $8.50 to be paid directly to trainer")),
            ("*Age Requirement: 8 years old & above\n• Ingredient & Material Fee: $12 (Payable to Trainer)",
             ("Age Requirement: 8 years old & above", "Ingredient & Material Fee: $12 (Payable to Trainer)")),
            ("Menu\nBring an apron", (None, None)),
        ]
        for remarks, expected in cases:
            item = {**BREAD, "xp": {**BREAD["xp"], "Class": {"RequirementsAndRemarks": remarks}}}
            e = onepa.event(item, None, {}, None, refresh.short_description)
            self.assertEqual((e.get("age_note"), e.get("fee_note")), expected, remarks)

    def test_a_weekly_course_lists_its_sessions_in_order(self):
        e = onepa.event(WEEKLY, None, onepa.page_details(WEEKLY_PAGE, "c027245039"), (0, 25), refresh.short_description)
        self.assertEqual(e["session_count"], 3)
        self.assertEqual([s["start"][:10] for s in e["sessions"]], ["2026-10-07", "2026-10-14", "2026-11-11"])
        self.assertEqual((e["start"], e["end"], e["duration_minutes"]), ("2026-10-07T19:00:00+08:00", "2026-11-11T21:00:00+08:00", 120))
        self.assertEqual(e["registration"]["status"], "full")
        self.assertNotIn("booking_url", e, "no published URL, no link")

    def test_an_event_takes_its_tickets_and_address(self):
        e = onepa.event(RECIPES, "https://www.onepa.gov.sg/events/x-43720360", onepa.page_details(RECIPES_PAGE, "43720360"), None, refresh.short_description)
        self.assertIs(e["free"], True)
        self.assertEqual(e["registration"], {"status": "open", "seats_left": 21, "capacity": 25, "note": "21 tickets available on onePA."})
        self.assertEqual(e["venue"], "13 Tampines Street 11, Tampines Changkat Constituency Office")
        self.assertEqual(e["venue_group"], "Tampines Changkat CC")

    def test_build_keeps_the_tampines_clubs_classes_and_drops_links_outside_onepa(self):
        clubs = onepa.tampines_clubs(OUTLETS)
        urls = {**onepa.sitemap_urls(SITEMAP), "c027245039": "https://example.com/c027245039"}
        elsewhere = {**BREAD, "product_code": "C027239412", "outlet_name": "Pasir Ris East CC"}
        changkat = {**RECIPES, "outlet_name": "Tampines East CC"}
        events, source = refresh.build_onepa(clubs, [BREAD, elsewhere, BREAD, WEEKLY], [changkat, {**ZUMBA, "type": "Event"}], urls, {}, {})
        self.assertEqual([e["id"] for e in events], ["onepa-c027244088", "onepa-c027245039", "onepa-43720360"])
        self.assertNotIn("booking_url", events[1])
        self.assertEqual({c["name"]: (c["events_listed"], c["kept"]) for c in source["clubs"]}, {"Our Tampines Hub": (0, 0), "Tampines East CC": (2, 3)})
        self.assertEqual((source["courses_open"], source["courses_at_clubs"], source["kept"]), (3, 2, 3), "Pasir Ris East is open island-wide but not kept")


class Requests(unittest.TestCase):
    """What refresh.py does with an answer, without the network: urlopen is replaced by a canned response."""

    def answer(self, text):
        class Response(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        return mock.patch.object(refresh.urllib.request, "urlopen", lambda *a, **k: Response(text.encode()))

    def test_a_bot_check_stops_the_refresh_instead_of_being_parsed(self):
        challenge = '<html>\r\n<head>\r\n<META NAME="robots" CONTENT="noindex,nofollow">\r\n<script src="/_Incapsula_Resource?SWJIYLWA=1"></script>'
        with self.answer(challenge), self.assertRaises(refresh.Blocked):
            refresh.request("https://www.onepa.gov.sg/-api/search/query", {"searchKeyword": ""})


class Guards(unittest.TestCase):
    """What a refresh writes, or refuses to write, once the sources have answered: in a copy of this folder."""

    NOW = datetime.fromisoformat("2026-10-05T09:00:00+08:00")
    SLUG = "tampines-library-events"

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        self.dir = self.root / "viz" / self.SLUG
        self.dir.mkdir(parents=True)
        for name in ("visual.json", "build.py", "index.html"):
            shutil.copy(HERE / name, self.dir / name)

    def data(self, listing=(LASER, EAT, STORY), outlets=OUTLETS, now=NOW):
        nlb = refresh.build_nlb(list(listing), {"5974092": {"status": "open", "seats_left": 3}})
        clubs = onepa.tampines_clubs(outlets)
        pa = refresh.build_onepa(clubs, [BREAD, WEEKLY], [{**RECIPES, "outlet_name": "Tampines East CC"}], onepa.sitemap_urls(SITEMAP), {}, {})
        return refresh.build(nlb, pa, now)

    def previous(self, data):
        (self.dir / "data.json").write_text(refresh.text_of(data), encoding="utf-8")

    def files(self):
        return {path.name: path.read_bytes() for path in self.dir.iterdir()}

    def refused(self, data, failures=(), **kwargs):
        before = self.files()
        with self.assertRaises(refresh_kit.Failed) as caught:
            refresh.update(data, list(failures), self.dir, **kwargs)
        self.assertEqual(self.files(), before, "a refused run writes nothing")
        return str(caught.exception)

    def run_refresh(self, dry_run=False, **flags):
        args = argparse.Namespace(**{"no_pages": False, "allow_partial": False, "force": False, **flags})
        out = io.StringIO()
        code = refresh_kit.run(self.SLUG, dry_run, args, refresh_kit.Replay({}, now=self.NOW), root=self.root, out=out, hook=refresh)
        return code, out.getvalue()

    def test_a_class_page_that_fails_is_counted(self):
        with mock.patch.object(refresh, "fetch_listing", return_value=[LASER, STORY]), mock.patch.object(refresh.time, "sleep"), \
                mock.patch.object(refresh, "request", side_effect=refresh.urllib.error.URLError("timed out")), \
                mock.patch("sys.stderr", io.StringIO()):
            failures = []
            kept, _ = refresh.fetch_nlb(True, failures)
        self.assertEqual(failures, [LASER["link"]])
        self.assertNotIn("registration", kept[0])

    def test_a_partial_run_exits_2_and_writes_nothing_unless_allowed(self):
        self.previous(self.data())
        def nlb(read_pages, failures):
            failures.append("https://nlb.libcal.com/event/5974092")
            return refresh.build_nlb([LASER, EAT], {})
        def pa(today, read_pages, failures):
            return refresh.build_onepa(onepa.tampines_clubs(OUTLETS), [BREAD], [], {}, {}, {})
        with mock.patch.object(refresh, "fetch_nlb", nlb), mock.patch.object(refresh, "fetch_onepa", pa):
            before = self.files()
            code, out = self.run_refresh()
            self.assertEqual(code, refresh_kit.FAILED)
            self.assertIn("failed to load", out)
            self.assertEqual(self.files(), before)
            code, out = self.run_refresh(allow_partial=True)
        self.assertEqual(code, 0, out)
        self.assertEqual(json.loads((self.dir / "data.json").read_text())["retrieved"], "2026-10-05T09:00:00+08:00")
        self.assertEqual(json.loads((self.dir / "visual.json").read_text())["fetched"], "2026-10-05")
        self.assertNotEqual((self.dir / "index.html").read_bytes(), before["index.html"], "build.py ran")

    def test_a_dry_run_reports_the_changes_and_writes_nothing(self):
        self.previous(self.data(listing=(LASER, STORY)))
        before = self.files()
        with mock.patch.object(refresh, "fetch_nlb", lambda read_pages, failures: refresh.build_nlb([LASER, EAT, STORY], {})), \
                mock.patch.object(refresh, "fetch_onepa", lambda today, read_pages, failures: refresh.build_onepa(onepa.tampines_clubs(OUTLETS), [BREAD], [], {}, {}, {})):
            code, out = self.run_refresh(dry_run=True)
        self.assertEqual(code, 0)
        self.assertIn("result: changes\n", out)
        self.assertIn('added,"5975969 Come, Let\'s Eat | TOYLC26",2026-10-04', out)
        self.assertEqual(self.files(), before)

    def test_a_source_that_fails_exits_2(self):
        with mock.patch.object(refresh, "fetch_listing", side_effect=refresh.urllib.error.HTTPError(refresh.API_URL, 503, "down", {}, None)):
            code, out = self.run_refresh()
        self.assertEqual(code, refresh_kit.FAILED)
        self.assertIn("HTTPError", out)

    def test_an_empty_nlb_listing_is_refused_unless_forced(self):
        data = self.data(listing=())
        self.assertIn("NLB lists no event", self.refused(data))
        self.assertEqual(refresh.update(data, [], self.dir, force=True).files["data.json"], refresh.text_of(data))

    def test_no_tampines_club_on_onepa_is_refused(self):
        self.assertIn("no Tampines community club", self.refused(self.data(outlets={"data": []})))

    def test_a_shrink_by_more_than_half_is_refused(self):
        self.previous(self.data())  # 5 classes: 2 NLB, 3 onePA
        shrunk = self.data()
        shrunk["events"] = shrunk["events"][:2]
        self.assertIn("2 classes kept, less than half of the previous 5", self.refused(shrunk))
        refresh.update(self.data(listing=(STORY,)), [], self.dir)  # 3 of 5 is a quiet week, not a broken run

    def test_fetched_becomes_the_singapore_date_of_the_retrieval(self):
        update = refresh.update(self.data(now=datetime.fromisoformat("2026-10-04T20:00:00+00:00")), [], self.dir)
        self.assertEqual(update.fetched, "2026-10-05", "20:00 UTC is the next morning in Singapore")

    def test_the_summary_lists_added_removed_and_changed_classes(self):
        old = self.data(listing=(LASER, STORY))
        new = self.data(listing=(EAT, STORY))
        new["events"] = [{**e, "registration": {"status": "full"}} if e["id"] == "onepa-c027244088" else e for e in new["events"]]
        rows = refresh.summary(old, new)
        self.assertIn({"kind": "source", "item": "NLB", "detail": "1 kept of 2 listed (previous 1 of 2)"}, rows)
        self.assertIn({"kind": "added", "item": "5975969 Come, Let's Eat | TOYLC26", "detail": "2026-10-04"}, rows)
        self.assertIn({"kind": "removed", "item": "5974092 Laser Cutting Starter Session @ Tampines Library | MakeIT", "detail": "2026-10-04"}, rows)
        self.assertIn({"kind": "registration", "item": "onepa-c027244088 Breadmaking", "detail": "no notice -> full"}, rows)
        self.assertEqual([row["kind"] for row in refresh.summary(old, old)], ["source", "source"])

    def test_the_same_classes_retrieved_later_change_nothing(self):
        self.previous(self.data())
        later = self.data(now=datetime.fromisoformat("2026-10-06T09:00:00+08:00"))
        self.assertEqual(refresh.update(later, [], self.dir).files["data.json"], (self.dir / "data.json").read_text(encoding="utf-8"))
        self.assertEqual(refresh.text_of(self.data()), refresh.text_of(self.data()))


class Snapshot(unittest.TestCase):
    """The committed data.json is what refresh.py writes."""

    def setUp(self):
        self.data = json.loads((HERE / "data.json").read_text(encoding="utf-8"))

    def test_categories_are_the_refresh_rules(self):
        self.assertEqual(self.data["categories"], refresh.CATEGORIES)

    def test_every_class_has_an_official_booking_link_and_a_unique_id(self):
        ids = [e["id"] for e in self.data["events"]]
        self.assertEqual(len(ids), len(set(ids)))
        for e in self.data["events"]:
            self.assertTrue(refresh.booking_ok(e["booking_url"]), e["booking_url"])
            self.assertIn(e["category"], {c["id"] for c in refresh.CATEGORIES})
            self.assertIn((e["source"], e["organiser"]), {("nlb", "NLB"), ("onepa", "onePA")})

    def test_each_source_accounts_for_what_it_listed(self):
        nlb, pa = self.data["sources"]
        self.assertEqual(nlb["listed"], nlb["kept"] + len(nlb["excluded"]))
        self.assertEqual(pa["kept"], sum(c["kept"] for c in pa["clubs"]))
        self.assertLessEqual(pa["courses_at_clubs"], pa["courses_open"])
        self.assertEqual(nlb["kept"] + pa["kept"], len(self.data["events"]))


if __name__ == "__main__":
    unittest.main()
