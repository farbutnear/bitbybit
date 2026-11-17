"""Bits, card packs, gear and the perks gear gives.

Bits are earned by learning and can't be bought. They buy card packs (three gear cards
each) and streak freezes. Gear goes in one of three slots on the llama, and every piece
does something:

  second_try     a wrong answer is caught once per session: no reveal, answer again
  combo_bonus    extra bits per answer once you are three right in a row
  extra_charge   one more charge for the face perks
  strike_option  removes one wrong option from a multiple-choice card
  clear_node     rules out one healthy component on a find-the-fault card
  freeze_slot    the streak can hold one more freeze
  bits_bonus     25% more bits from everything

No perk answers a card for you. Any card answered with help is scheduled as shaky
(FSRS "Hard" instead of "Good") and pays fewer bits, so it comes back sooner.
"""

import math
import random
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Card, PerkUse, PlaySession, Review, User, UserGear

SLOTS = ("head", "face", "neck")
RARITIES = ("common", "rare", "legendary")

GEAR: dict[str, dict] = {
    "rollback-cap": {
        "name": "Rollback cap",
        "slot": "head",
        "rarity": "rare",
        "perk": "second_try",
        "blurb": "Once per session, a wrong answer is rolled back before it counts. Try again.",
    },
    "oncall-headset": {
        "name": "On-call headset",
        "slot": "head",
        "rarity": "common",
        "perk": "combo_bonus",
        "blurb": "In the zone: from your third right answer in a row, each one pays 3 extra bits.",
    },
    "root-crown": {
        "name": "Root crown",
        "slot": "head",
        "rarity": "legendary",
        "perk": "extra_charge",
        "blurb": "Root access: your face gear gets a second charge every session.",
    },
    "debug-visor": {
        "name": "Debug visor",
        "slot": "face",
        "rarity": "rare",
        "perk": "strike_option",
        "blurb": "Once per session, strikes one wrong option off a multiple-choice card.",
    },
    "tracer-lens": {
        "name": "Tracer lens",
        "slot": "face",
        "rarity": "rare",
        "perk": "clear_node",
        "blurb": "Once per session, rules out one healthy component on a find-the-fault card.",
    },
    "replica-tags": {
        "name": "Replica tags",
        "slot": "neck",
        "rarity": "common",
        "perk": "freeze_slot",
        "blurb": "Redundancy: your streak can hold one extra freeze.",
    },
    "block-chain": {
        "name": "Block chain",
        "slot": "neck",
        "rarity": "rare",
        "perk": "bits_bonus",
        "blurb": "25% more bits from everything you earn.",
    },
}

# ---------- economy ----------

PACK_COST = 100
PACK_SIZE = 3
ODDS = {"common": 0.60, "rare": 0.35, "legendary": 0.05}  # per card
PITY_PACKS = 10  # a legendary is guaranteed at least once every this many packs
DUPLICATE_REFUND = {"common": 15, "rare": 30, "legendary": 100}
FREEZE_COST = 150

BITS_CARD = 5  # a new or due card, right first try
BITS_CARD_ASSISTED = 2  # the same, but a perk helped
BITS_CARD_AHEAD = 1  # practising a card that wasn't due yet
BITS_LESSON = 20  # finishing a lesson for the first time
BITS_GOAL = 25  # meeting the daily goal
BITS_STREAK_WEEK = 50  # every 7th day of a streak
COMBO_AFTER = 3
COMBO_BITS = 3
BITS_BONUS = 0.25

USABLE_PERKS = {"strike_option": "mcq", "clear_node": "spot"}  # perk -> the card kind it works on
SESSION_PERKS = ("second_try", "strike_option", "clear_node")


class LootError(ValueError):
    """The request can't be done right now (not enough bits, no charges left, ...)."""


# ---------- gear ----------

def owned(db: Session, user: User) -> dict[str, UserGear]:
    return {g.gear_id: g for g in db.scalars(select(UserGear).where(UserGear.user_id == user.id))}


def equipped(db: Session, user: User) -> dict[str, str | None]:
    """slot -> gear id (or None)."""
    out: dict[str, str | None] = dict.fromkeys(SLOTS)
    for g in db.scalars(select(UserGear).where(UserGear.user_id == user.id, UserGear.equipped.is_(True))):
        out[GEAR[g.gear_id]["slot"]] = g.gear_id
    return out


def active_perks(db: Session, user: User) -> set[str]:
    return {GEAR[g]["perk"] for g in equipped(db, user).values() if g}


def equip(db: Session, user: User, gear_id: str, on: bool = True) -> None:
    if gear_id not in GEAR:
        raise LootError("unknown gear")
    mine = owned(db, user)
    if gear_id not in mine:
        raise LootError("you don't own that yet")
    if on:
        for other in mine.values():  # one piece per slot
            if GEAR[other.gear_id]["slot"] == GEAR[gear_id]["slot"]:
                other.equipped = False
    mine[gear_id].equipped = on
    db.commit()


def max_freezes(db: Session, user: User) -> int:
    return settings.max_streak_freezes + (1 if "freeze_slot" in active_perks(db, user) else 0)


# ---------- bits ----------

def award(db: Session, user: User, amount: int) -> int:
    """Add bits, applying the bits bonus if it is equipped. Returns what was actually added."""
    if amount <= 0:
        return 0
    if "bits_bonus" in active_perks(db, user):
        amount = math.ceil(amount * (1 + BITS_BONUS))
    user.bits += amount
    user.bits_earned += amount
    return amount


def buy_freeze(db: Session, user: User) -> None:
    if user.streak_freezes >= max_freezes(db, user):
        raise LootError("your streak is already holding as many freezes as it can")
    if user.bits < FREEZE_COST:
        raise LootError("not enough bits")
    user.bits -= FREEZE_COST
    user.streak_freezes += 1
    db.commit()


# ---------- packs ----------

def roll_pack(rng: random.Random, packs_since_legendary: int) -> list[str]:
    """Pick the gear ids in one pack. Pure, so the odds and the pity rule are easy to test."""
    by_rarity = {r: [g for g, d in GEAR.items() if d["rarity"] == r] for r in RARITIES}
    picks: list[str] = []
    for i in range(PACK_SIZE):
        rarity = rng.choices(RARITIES, weights=[ODDS[r] for r in RARITIES])[0]
        last = i == PACK_SIZE - 1
        if last and packs_since_legendary >= PITY_PACKS - 1 and not any(GEAR[p]["rarity"] == "legendary" for p in picks):
            rarity = "legendary"
        pool = [g for g in by_rarity[rarity] if g not in picks] or by_rarity[rarity]  # avoid repeats in one pack
        picks.append(rng.choice(pool))
    return picks


def open_pack(db: Session, user: User, now: datetime, rng: random.Random | None = None) -> dict:
    if user.bits < PACK_COST:
        raise LootError("not enough bits")
    rng = rng or random.Random()
    user.bits -= PACK_COST
    picks = roll_pack(rng, user.packs_since_legendary)
    user.packs_opened += 1
    user.packs_since_legendary = 0 if any(GEAR[p]["rarity"] == "legendary" for p in picks) else user.packs_since_legendary + 1

    mine = owned(db, user)
    cards = []
    for gear_id in picks:
        refund = 0
        if gear_id in mine:
            # A duplicate pays some bits back. Refunds are not earnings: no bonus, not in the lifetime total.
            mine[gear_id].copies += 1
            refund = DUPLICATE_REFUND[GEAR[gear_id]["rarity"]]
            user.bits += refund
        else:
            mine[gear_id] = UserGear(user_id=user.id, gear_id=gear_id, copies=1, equipped=False, obtained_at=now)
            db.add(mine[gear_id])
        cards.append({"id": gear_id, **GEAR[gear_id], "new": refund == 0, "refund": refund})
    db.commit()
    return {"cards": cards, "bits": user.bits}


def loot_summary(db: Session, user: User) -> dict:
    mine = owned(db, user)
    return {
        "bits": user.bits,
        "bits_earned": user.bits_earned,
        "pack": {
            "cost": PACK_COST,
            "size": PACK_SIZE,
            "odds": ODDS,
            "pity_every": PITY_PACKS,
            "packs_until_guaranteed_legendary": PITY_PACKS - user.packs_since_legendary,
            "duplicate_refund": DUPLICATE_REFUND,
            "opened": user.packs_opened,
        },
        "freeze": {
            "cost": FREEZE_COST,
            "held": user.streak_freezes,
            "max": max_freezes(db, user),
        },
        "slots": list(SLOTS),
        "gear": [
            {
                "id": gear_id,
                **d,
                "owned": gear_id in mine,
                "copies": mine[gear_id].copies if gear_id in mine else 0,
                "equipped": bool(gear_id in mine and mine[gear_id].equipped),
            }
            for gear_id, d in GEAR.items()
        ],
    }


# ---------- play sessions and perk charges ----------

def start_session(db: Session, user: User, lesson_id: str | None, now: datetime) -> dict:
    """Open a lesson or review run. Charges are per session, so each run starts with fresh ones."""
    stale = now - timedelta(days=2)
    old = list(db.scalars(select(PlaySession.id).where(PlaySession.user_id == user.id, PlaySession.created_at < stale)))
    if old:
        db.execute(delete(PerkUse).where(PerkUse.session_id.in_(old)))
        db.execute(delete(PlaySession).where(PlaySession.id.in_(old)))
    session = PlaySession(id=str(uuid.uuid4()), user_id=user.id, lesson_id=lesson_id, created_at=now)
    db.add(session)
    db.commit()
    return {"id": session.id, "perks": charges_left(db, user, session)}


def get_session(db: Session, user: User, session_id: str | None) -> PlaySession | None:
    if not session_id:
        return None
    session = db.get(PlaySession, session_id)
    return session if session and session.user_id == user.id else None


def charges_left(db: Session, user: User, session: PlaySession) -> dict[str, int]:
    perks = active_perks(db, user)
    used = dict(
        db.execute(select(PerkUse.perk, func.count()).where(PerkUse.session_id == session.id).group_by(PerkUse.perk)).all()
    )
    out = {}
    for perk in SESSION_PERKS:
        total = 1 if perk in perks else 0
        if total and perk in USABLE_PERKS and "extra_charge" in perks:
            total += 1
        out[perk] = max(0, total - used.get(perk, 0))
    return out


def record_use(db: Session, session: PlaySession, perk: str, card_id: str, detail: str | None, now: datetime) -> None:
    db.add(PerkUse(session_id=session.id, user_id=session.user_id, perk=perk, card_id=card_id, detail=detail, used_at=now))


def was_assisted(db: Session, session: PlaySession | None, card_id: str) -> bool:
    if session is None:
        return False
    return bool(
        db.scalar(select(func.count()).select_from(PerkUse).where(PerkUse.session_id == session.id, PerkUse.card_id == card_id))
    )


def combo(db: Session, session: PlaySession | None) -> int:
    """How many first-try, unassisted right answers in a row the session ends with."""
    if session is None:
        return 0
    n = 0
    rows = db.execute(
        select(Review.correct, Review.assisted, Review.rating).where(Review.session_id == session.id).order_by(Review.id.desc())
    )
    for correct, assisted, rating in rows:
        if rating == 0:  # an in-lesson retry: neither extends nor breaks the run
            continue
        if not correct or assisted:
            break
        n += 1
    return n


def use_perk(
    db: Session, user: User, session: PlaySession, perk: str, card: Card, now: datetime, rng: random.Random | None = None
) -> dict:
    """Spend a charge of a face perk on a card. Returns what to grey out; never the answer itself."""
    if perk not in USABLE_PERKS:
        raise LootError("that perk can't be used directly")
    if card.kind != USABLE_PERKS[perk]:
        raise LootError("that perk doesn't work on this kind of card")
    if charges_left(db, user, session)[perk] <= 0:
        raise LootError("no charges left this session")
    rng = rng or random.Random()
    already = set(
        db.scalars(
            select(PerkUse.detail).where(PerkUse.session_id == session.id, PerkUse.card_id == card.id, PerkUse.perk == perk)
        )
    )
    d = card.data
    if perk == "strike_option":
        open_wrong = [str(i) for i in range(len(d["options"])) if i != d["answer"] and str(i) not in already]
        if len(open_wrong) < 2:  # always leave a real choice
            raise LootError("nothing left to strike on this card")
        pick = rng.choice(open_wrong)
        result = {"removed_option": int(pick)}
    else:
        nodes = [n for n in d["diagram"]["nodes"] if n["id"] != d["answer"] and n["id"] not in already]
        if len(nodes) < 2:
            raise LootError("nothing left to rule out on this card")
        # Ruling out the users is no help: prefer real components.
        pick = rng.choice([n["id"] for n in nodes if n.get("kind") != "client"] or [n["id"] for n in nodes])
        result = {"cleared_node": pick}
    record_use(db, session, perk, card.id, pick, now)
    db.commit()
    return result | {"perks": charges_left(db, user, session)}
