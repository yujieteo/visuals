"""refresh.py offline: how NLB's listing becomes data.json, without the network.

The records below are cut down from NLB's EventFilter response and GoLibrary (LibCal) pages as retrieved on
2026-10-03: the fields refresh.py reads, with their published values.
"""
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import refresh  # noqa: E402


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
        data = refresh.build([STORY, LASER, EAT, TALK, stray], {"5974092": {"status": "waitlist"}}, datetime.fromisoformat("2026-10-03T13:20:37+08:00"))
        self.assertEqual(data["listed"], 5)
        self.assertEqual([e["id"] for e in data["events"]], ["1", "5974092", "5975969"])
        self.assertEqual({x["id"] for x in data["excluded"]}, {"5863211", "5975405"})
        self.assertNotIn("booking_url", data["events"][0], "a link outside NLB's own sites is dropped, not replaced")
        self.assertEqual(data["events"][1]["registration"], {"status": "waitlist"})
        self.assertEqual(data["retrieved"], "2026-10-03T13:20:37+08:00")
        self.assertEqual(data["source"]["api_query"]["filter"]["Location"], ["TRL"])


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
        self.assertEqual(self.data["listed"], len(self.data["events"]) + len(self.data["excluded"]))


if __name__ == "__main__":
    unittest.main()
