
**Project Name:** Managinga space, Smart Activity Manager / To-Do List with Advanced Features

**Objective:**
Develop a **full-stack activity manager app** that allows users to create, track, and complete activities with advanced reminders, payment tracking, recurring tasks, and statistics. The app should support **freemium and paid plans**, admin settings, and PWA features. All data should be stored in a **MySQL database**.

---

### **Stack**

* **Backend:** Node.js + Express
* **Database:** MySQL
* **Frontend:** EJS templates + latest Bootstrap CSS
* **Notifications:** Email via Nodemailer + Push Notifications via Web Push API
* **Scheduler:** node-cron for reminders
* **Payments:** flutterwave for paid plan subscriptions (can choose to subscibe n month (1,2,3,4,5 etc mothns, 1 year, 2 years etc can choose))
* **PWA:** Installable on mobile/desktop, offline support

---

### **Core Features**

#### **1. User Activities**

* Create, edit, delete activities
* Activity types:
the activities will be categoirized in a way (what the user will do or if the task is the things expected for the other one else to do (hope you understand))
  * **General**: standard to-do
  * **Payment**: total amount, partial payments, remaining balance (both for user who will pay them or the one they will pay)
  * **Purchase Goal**: target item, recurring reminders until completion
  * **
* Set due date, priority, progress (% complete or subtasks)
* Mark as completed
* Activity dashboard shows completion status

#### **2. Reminders**

* Email reminders (free & paid)
* Push notifications (paid only)
* Recurring reminders (daily/weekly/monthly) until activity is completed (user can choose)
* node-cron handles scheduling

#### **3. Plans**

* **Free Plan:** Max 5 activities, email reminders, basic features
* **Trial Plan:** 1 month full access automatically at signup
* **Paid Plan:** Unlimited activities, push notifications, attachments, recurring tasks, categories, priority levels, advanced progress tracking
* Admin can manage plans: limits, features, prices

#### **4. Payments / Partial Payment Tracking**

* Track total amount due for payment-related activities
* Log partial payments, calculate remaining balance automatically
* Mark as complete when fully paid
* Dashboard shows payment progress and totals

#### **5. Purchase Planning**

* Activities for items the user wants to buy
* Set recurring reminders until done
* Track completion status

#### **6. Dashboard & Statistics**

* Total activities created
* Completed vs pending activities
* Payment totals and remaining balances
* Recurring activity cycles completed
* Visual progress indicators (bars and charts)
* analytics of how the user is doing well or bad, due to meeting deadlines. if the tasks are completed, show him what he mostly do best in an ai-like mode (interactive conversation wiuth the app)

#### **7. Admin Panel**

* Manage plans, features, prices
* Global settings (reminder intervals, trial length)
* View user stats, activity usage, expiring trials
* Ability to create/update/delete default plans

#### **8. Auto Database Setup**

* On first run, automatically create all tables and seed:

  * Default plans
  * Admin user
  * Default settings

#### **9. PWA Support**

* Installable on mobile & desktop
* Offline functionality
* Background sync for reminders

### **Business Logic**

* Trial plan lasts 1 month from signup, auto-downgrades to free
* Free plan limits enforced by backend
* Recurring reminders stop when activity is completed
* Payment progress auto-updates dashboard

---

### **Frontend Features**

* Responsive design (Bootstrap)
* Activity lists with filters (type, completed, pending)
* Forms for activity creation with dynamic fields for payment/purchase type
* Progress bars for payments and activity completion
* Dashboard with statistics and visual summaries
* analytics of how the user is doing well or bad, due to meeting deadlines. if the tasks are completed, show him what he mostly do best in an ai-like mode (interactive conversation wiuth the app)

---

### **Extra Requirements**

* Freemium model with smooth conversion from trial to paid
* Secure payment integration
* All user data stored in MySQL database
* Admin panel for app configuration

---

### ADDITIONAL FUNCTIONALITIES:

Users can add a task that will be completed by diffrent people. he can invite collaborators by email and when user clicks on that link in email he signup using google and then be redirected to his account so that he can collaborate with the project and the user can track the collaborators progress and completions also the user will be able to create a group in that app with the users to tell them in caht what to do, also the user will be able to chat with some users in the app. he can search users joined the app and send them a message, once a user accept that message 9for fisrt time) the user is added to the list of friends. also the teams 9groups0 will be listed and can add people to team and when a user receives a message to be added to team he can accept it for first time or reject it

**Instructions

> Generate a **full-stack Node.js + Express + EJS app** with MySQL, implementing all features above. Include database setup scripts, models, routes, controllers, and frontend templates. Ensure freemium plan logic, trial handling, reminders, payment tracking, purchase goals, recurring notifications, PWA support, and admin panel. Include comments in code for clarity.

i need that ther e is an admin url to login (/admin) so that when i visit it i get the login form and login as admin not like normal users logins with google just i login with email and password as admin

the app is workjing great but there is aproblem. the push notification and email notficationjm is not working. please make sure when anything is done, the app notifies user i n push notification and in email. check in backend where the notification is  neccessary and include it. also the app should ask people for allowing notification (i din't see that) and then send push notifications to them. try to do this in backend and 