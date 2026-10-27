# Druk Serve - Testing Checklist

Tick each box as you test. Before you start, open `/reset.html` so you begin with fresh sample data.
Test on a computer first, then shrink the browser window (or use F12 > phone icon) to check the phone layout.

## 1. Public pages

**Landing page (`index.html`)**
- [ ] 7 service cards and 4 top providers are shown
- [ ] Search box sends you to the providers page (it asks you to log in first)
- [ ] "Join as a Provider" opens the register page with Service Provider selected
- [ ] On a phone, the menu turns into a hamburger button that opens and closes

**Register (`register.html`)**
- [ ] Empty form shows red errors
- [ ] Weak password (`abc`) is rejected; `Test@1234` is accepted and the strength bar turns green
- [ ] Mismatched confirm password is rejected
- [ ] Using an email that already exists is rejected
- [ ] Switching to Service Provider shows category, rate, experience and bio
- [ ] A valid form sends you to Login with a green "Account created" message

**Login (`login.html`)**
- [ ] Unknown email, wrong password and wrong role each show a different message
- [ ] Clicking a test account fills in the form
- [ ] Show/hide password button works
- [ ] Customer, Provider and Admin each land on their own dashboard
- [ ] Opening any customer, provider or admin page while logged out sends you to Login
- [ ] A customer cannot open provider or admin pages (and the other way round)

## 2. Customer

- [ ] **Home:** welcome name, service tiles, upcoming bookings, top providers
- [ ] **Find Services:** filters (service, location, price, rating), sort, Reset, and the "no match" message all work
- [ ] **Search words:** typing `leaking tap` on Home finds the plumber
- [ ] **Provider profile:** details, reviews and provider replies are shown; Book Now works
- [ ] **Booking:** empty date or time is rejected; a past date is rejected; a non-working day is rejected; total price changes with hours
- [ ] **Payment:** Online (pretend) shows Processing then Success; Cash confirms the booking
- [ ] **My Bookings:** Current and Past tabs with counts, status timeline, View Details, Pay Now, Cancel (with confirmation)
- [ ] **Rate Service:** star rating required, comment optional, you cannot rate twice
- [ ] **Notifications:** click to mark read, Mark all as read, Clear all; the red number in the menu updates
- [ ] **My Profile:** invalid phone is rejected; saving updates your name in the menu
- [ ] **Change password:** wrong current, weak, same-as-old and mismatch are each rejected; after changing it you can log in with the new password

## 3. Service Provider

- [ ] **Dashboard:** 4 summary numbers; tabs Requests, Confirmed, History
- [ ] **Accept** a request: it moves to Confirmed and the customer is notified
- [ ] **Decline** a request: asks for confirmation, then moves to History
- [ ] **Mark as Completed:** asks for confirmation; earnings go up
- [ ] **My Services:** invalid rate and "end time before start time" are rejected; the preview card updates as you type; saved changes affect what customers see
- [ ] **Accepting new bookings** switched off: provider disappears from customer search
- [ ] **Earnings:** completed jobs appear with the correct totals
- [ ] **Feedback:** empty reply is rejected; a sent reply appears on the provider's public profile
- [ ] **New provider:** shows the yellow "Awaiting verification" warning

## 4. Admin

- [ ] **Overview:** 6 summary numbers, providers needing attention, recent bookings
- [ ] **Provider Verification:** Pending / Verified / All filters; Details; Verify; Revoke (with confirmation)
- [ ] **Users:** search, role filter, Suspend and Activate; a suspended user cannot log in
- [ ] **Categories:** add, edit (rename updates providers), delete is refused when providers use the category
- [ ] **Reports:** status, payments, category, revenue and top providers show correct numbers

## 5. Whole journey (best for your demonstration)

1. [ ] Register a new provider
2. [ ] Admin verifies the provider
3. [ ] Customer finds and books that provider, pays online
4. [ ] Provider accepts, then marks the job completed
5. [ ] Customer rates the service
6. [ ] Provider replies to the feedback
7. [ ] Admin opens Reports and sees the completed job

## 6. Before you submit

- [ ] No red errors in the browser console (F12 > Console) on any page
- [ ] No page scrolls sideways on a phone-size window
- [ ] Your name, class and project title are correct in the footer
- [ ] `git add .`, `git commit`, `git push` done, and the latest commit is visible on GitHub
