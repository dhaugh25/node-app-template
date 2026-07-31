# CourseConnect

CourseConnect is a full-stack web application developed as a senior capstone project at Arizona State University. The application helps students organize coursework, connect with classmates, discover campus resources, and manage their academic schedules in one place.

## Technologies

- Node.js
- Express.js
- MySQL
- HTML/CSS/JavaScript
- JSON Web Tokens (JWT)
- bcrypt
- Git/GitHub

## Features

- User account creation and secure login
- JWT authentication and protected routes
- Student dashboard
- Course management (add, edit, delete classes)
- Student profile management
- Campus resources page
- Community/friend request system
- Browser notifications
- MySQL database integration

## My Contributions

As part of a five-person senior capstone team, I primarily contributed:

- Implementing JWT login and authentication
- Developing the Resources page
- Database integration and testing
- Git branch management and code integration

## Architecture

The application follows an MVC architecture.

- **Model:** `public/js/datamodel.js`
- **View:** HTML pages in `/public`
- **Controller:** JavaScript controllers in `/public/js`
- **Backend:** Express API in `server.js`
- **Database:** MySQL

## Running the Project

```bash
npm install
npm run dev
```

Then navigate to:

```
http://localhost:3000
```
