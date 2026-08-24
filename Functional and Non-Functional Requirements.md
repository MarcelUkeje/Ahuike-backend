For any of this, state how you're going to go about implementing it before you do.

Would it be possible to have a web page hosted on Render that we can do the admin stuff on instead of having it on the same app as the patients?

For everything that requires sending emails, notifications, SMS, etc., I'm assuming that there are free services that I can use. If not, inform me, and then we'll decide if we are to skip them or move forward with the paid alternatives.

## FRs

### 1. Patient Registration & Authentication
- Patient sign-up/login via email.
- OTP-based verification (email).

### 2. Patient Profile Management
- Personal details (DOB, gender, contact, address) (from the registration screen).
- Profile edit and deletion (with data retention rules).

### 3. Doctor Management
- Doctor profiles: specialty, qualifications, experience, consultation fee.
- Ratings and reviews display (Make the patient able to rate the doctor).
- A doctor's profile can also be deleted by the admin. (What happens to his appointments? The patients are refunded with an apology, or are assigned to a different doctor with the same specialty. We'll implement it to the point that it doesn't get too complicated.)
- Do all the slots for a doctor ever disappear due to booking, or do farther days just keep on being populated?

### 4. Search & Discovery
- Search by specialty, doctor name, department.
- Filters: availability, price range, gender, rating.
- Sort by next available slot, rating.
- "Book again" / recently visited doctors (e.g., Tunde sees Dr. Okafor every 3 months for hypertension management. Instead of searching "cardiologist near me" each time, he opens the app, sees "Dr. Okafor — Book Again" on his home screen from his visit history, taps it, and is taken straight to Dr. Okafor's next available slot, cutting a 5-step search flow down to 2 taps.)

### 5. Appointment Scheduling
- Real-time slot availability display.
- Book, reschedule, cancel appointments.
- Conflict detection (no double-booking of doctor appointments). (This would manifest as the slot disappearing from other patients' screens once someone wants to book it.)
- Also configure how long a patient has after clicking on an appointment slot before it is returned for other patients to book. (When the time, preferably 5 minutes, is almost up, the patient is notified on the payment screen.)
- Cancellation policy enforcement (cutoff windows, cancellation fees). (e.g., Patient Grace books a specialist consultation for Monday at 10 AM. The clinic's policy is "free cancellation up to 24 hours in advance, 50% fee thereafter." She tries to cancel Sunday at 11 AM, 23 hours before. The system checks the cutoff, detects she's inside the window, and displays "A cancellation fee of ₦5,000 applies" before she confirms, rather than silently cancelling and creating a billing dispute later.)
- Recurring appointment booking (physiotherapy, dialysis, etc.).
- Inform all patients who booked slots later than a cancelled one via push notifications that a slot has opened up as a patient cancels, asking them if they want to book a new one.
- Appointment types: new consultation, follow-up, procedure, diagnostic/lab test. (Is this necessary given the fact that patients are to add the reason for the appointment when booking?)

### 6. Notifications & Reminders
- Booking confirmation (push/email).
- Reminders at configurable intervals (24h, 1h before).
- Cancellation/reschedule alerts to both patient and doctor (push/email).
- Follow-up reminders post-visit (push/SMS/email). (This reminder would be the doctor's instructions from the appointment, which would also be in the app for that particular patient.)

### 7. Reviews & Feedback
- Post-visit rating and review submission.

### 8. Payments & Billing
- Fee display before booking confirmation.
- Online payment.
- Invoice/receipt generation. (This can just be a script with HTML and CSS, right?)
- Refund processing on cancellation. (Also specify in the code how much time is allowed for cancellation. It may be measured in hours. That would also imply that there is a kind of appointment that you'll book that you can't cancel afterwards.)
- Payment retry/failure handling. (e.g., Femi tries to pay for his consultation, but his bank's payment gateway times out mid-transaction. The app doesn't immediately cancel the slot. It holds the reservation for 5 minutes, shows "Payment failed, please retry," and offers an alternative payment method, such as a different card or wallet. Femi retries with a different card, payment succeeds, and the appointment is confirmed, instead of losing his slot to another patient because of a temporary network issue.)

## NFRs

### 1. Security
- Encryption in transit (TLS 1.2+) and at rest (AES-256).
- Secure session/token management (short-lived JWTs, refresh tokens).
- Secure handling of payment data (PCI-DSS if processing cards directly). (Aren't we already doing this by integrating Paystack?)

### 3. Performance
- Sub-2-second response for search/booking under normal load. (We don't need to go this extra mile if it is going to take too much time.)
- Efficient concurrency control to prevent double-booking during simultaneous requests. (Test on the app what happens when two people click on the same appointment in the same second. I think our app already handles that scenario, and if so, show me the part of the code that is responsible for it so that I can answer questions when asked. I want the AI to tell me how exactly it happens. If it happens that we don't have that, then we'll implement it.)
- Caching strategy for frequently accessed data (doctor lists, availability). (I think we already have this with Upstash Redis. Please confirm.)

### 6. Data Integrity & Consistency
- ACID-compliant transactions for booking and payment operations.
- Idempotent APIs to prevent duplicate bookings/charges on retry. (e.g., Blessing taps "Confirm Booking & Pay" on a spotty hospital Wi-Fi connection. The request reaches the server, the payment processes, and the appointment is created, but the confirmation response is lost due to the network drop. Her app shows a loading spinner, times out, and auto-retries the exact same request with the same idempotency key generated at the first tap. The server recognizes the key, sees the booking already exists, and simply returns the existing confirmation instead of creating a second appointment and charging her card again.)