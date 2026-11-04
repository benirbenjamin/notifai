# Testing Time-Based Activities

## How to Test the New Time-Based Features

### 1. Create a Timed Activity
1. Go to `/activities/create`
2. Select "Timed Task" as the type
3. Fill in the title and description
4. Set a **Start Time** (e.g., current time)
5. Set an **End Time** (e.g., 2 hours from now)
6. Click "Create Activity"

### 2. What You Should See

#### On Activities Page (`/activities`):
- **Time Progress** instead of percentage progress for timed activities
- Real-time countdown showing "Xh Ym remaining" or "Expired"
- Time updates automatically every minute
- Different colors: blue for active, red for expired

#### On Dashboard (`/dashboard`):
- Recent Activities section shows time remaining instead of progress bars
- Upcoming Activities shows "Starts in Xh" or "Yh remaining"
- Overdue Activities shows "Expired Xh ago"
- Real-time updates every minute

### 3. Test Scenarios

#### Scenario A: Future Activity
- Start Time: Tomorrow 9:00 AM
- End Time: Tomorrow 5:00 PM
- Expected: Shows "Starts in Xh" on dashboard

#### Scenario B: Active Activity
- Start Time: Now (or 30 minutes ago)
- End Time: 2 hours from now
- Expected: Shows countdown timer "1h 30m remaining"

#### Scenario C: Expired Activity
- Start Time: 3 hours ago
- End Time: 1 hour ago
- Expected: Shows "Expired" or "Time expired"

### 4. Features Implemented

✅ **Activities Page Features:**
- Time-based progress calculation
- Real-time countdown timers
- Time remaining display instead of percentages
- Visual indicators for expired tasks
- Automatic updates every minute

✅ **Dashboard Features:**
- Time-based display in Recent Activities
- Smart time display in Upcoming Activities
- Overdue time calculation for expired tasks
- Real-time countdown updates

✅ **Create Form Features:**
- "Timed Task" option in type dropdown
- Start Time and End Time fields (datetime-local)
- Dynamic form fields that show/hide based on type

### 5. Database Structure
The activities table now includes:
- `start_time` (DATETIME) - When the activity should start
- `end_time` (DATETIME) - When the activity should end
- Activities with type='timed' use these fields for progress calculation

### 6. Real-time Updates
- Countdown timers update every 60 seconds automatically
- No page refresh required
- Uses JavaScript to recalculate time remaining
- Handles timezone correctly using browser's local time
