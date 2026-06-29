"""One-off: probe which carrier email-to-SMS gateway actually delivers.

Canadian carriers have retired many email-to-SMS gateways, and number
portability means the gateway that works is the CURRENT carrier's domain
(not necessarily the original). So we send a distinctly-numbered test to every
major CA gateway for one number and see which arrive on the handset.

Run via test_sms.yml (workflow_dispatch). Uses the same EMAIL_* secrets as
notify.py. Not imported anywhere; safe to delete after testing.
"""
import os
import smtplib
import sys
from email.message import EmailMessage

PHONE = os.environ.get("TEST_PHONE", "2896898900").strip()

# (label, gateway domain, send a subject?) — subject matters for MMS gateways.
GATEWAYS = [
    ("Rogers SMS", "pcs.rogers.com", False),
    ("Rogers SMS-alt", "sms.rogers.com", False),
    ("Rogers MMS", "mms.rogers.com", True),
    ("Bell", "txt.bell.ca", False),
    ("Bell MMS", "pic.bell.ca", True),
    ("Telus", "msg.telus.com", False),
    ("Fido", "fido.ca", False),
    ("Fido SMS-alt", "sms.fido.ca", False),
    ("Koodo", "msg.koodomobile.com", False),
    ("Virgin", "vmobile.ca", False),
    ("Freedom", "txt.freedommobile.ca", False),
    ("SaskTel", "sms.sasktel.com", False),
]


def cfg():
    addr = os.environ.get("EMAIL_ADDRESS", "").strip()
    pw = os.environ.get("EMAIL_PASSWORD", "").strip()
    if not addr or not pw:
        print("ABORT: EMAIL_ADDRESS/EMAIL_PASSWORD not set.")
        return None
    try:
        port = int((os.environ.get("SMTP_PORT") or "587").strip())
    except ValueError:
        port = 587
    return {
        "address": addr, "password": pw,
        "server": (os.environ.get("SMTP_SERVER") or "smtp.gmail.com").strip(),
        "port": port,
    }


def send(c, to_addr, subject, body):
    msg = EmailMessage()
    msg["From"] = c["address"]
    msg["To"] = to_addr
    if subject:
        msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(c["server"], c["port"], timeout=30) as s:
        s.starttls()
        s.login(c["address"], c["password"])
        s.send_message(msg)


def main():
    c = cfg()
    if not c:
        return 1
    print(f"Sending {len(GATEWAYS)} gateway tests to {PHONE} from {c['address']}\n")
    results = []
    for i, (label, domain, with_subject) in enumerate(GATEWAYS, 1):
        to_addr = f"{PHONE}@{domain}"
        body = f"PC test {i}: {label}. Tell Claude which test #s you got."
        subject = f"PC test {i}" if with_subject else ""
        try:
            send(c, to_addr, subject, body)
            ok = "accepted"
        except Exception as e:  # noqa: BLE001
            ok = f"FAILED ({e})"
        print(f"  #{i:>2} {label:<14} {to_addr:<32} -> {ok}")
        results.append((i, label, domain, ok))

    # Email the sender a legend so they can map received texts to gateways.
    legend = "\n".join(
        f"#{i} = {label} ({domain}) — {ok}" for i, label, domain, ok in results)
    summary = (
        f"Sent {len(results)} carrier-gateway SMS tests to {PHONE}.\n\n"
        f"Watch your phone for texts labelled 'PC test <number>'. Whichever "
        f"numbers arrive tell us your working gateway. Legend:\n\n{legend}\n"
    )
    try:
        send(c, c["address"], "Parks Canada — SMS gateway test legend", summary)
        # Also send to the alert recipient in case that inbox is the one watched.
        send(c, "meetr1912@gmail.com", "Parks Canada — SMS gateway test legend", summary)
        print("\nLegend emailed to", c["address"], "and meetr1912@gmail.com")
    except Exception as e:  # noqa: BLE001
        print(f"\nLegend email failed: {e}")

    print("\nDone. Report which 'PC test #' texts arrive on the phone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
