require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { mongoose } = require('./db/mongoose');
const jwt = require('jsonwebtoken');

const app = express();

// MIDDLEWARES
app.use(bodyParser.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  
  res.header(
    "Access-Control-Expose-Headers",
    "x-access-token, x-refresh-token"
  )

  next();
});

let authenticate = (req, res, next) => {
  let token = req.header('x-access-token');
  jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
    if(err) {
      res.status(401).send(err);
    } else {
      req.user_id = decoded._id;
      next();
    }
  })
}

let verifySession = (req, res, next) => {
  let refreshToken = req.header('x-refresh-token');
  let _id = req.header('_id');
  User.findByIdAndToken(_id, refreshToken).then((user) => {
    if(!user) {
      return Promise.reject({ error: "User not found" })
    }
    req.user_id = user._id;
    req.refreshToken = refreshToken;
    req.userObject = user;
    let isSessionValid = false;
  
    user.sessions.forEach((session) => {
      if(session.token === refreshToken) {
        if(User.hasRefreshTokenExpired(session.expiresAt) === false) {
          isSessionValid = true;
        }
      }
    });

    if(isSessionValid) {
      next();
    } else {
      return Promise.reject({ error: "Refresh token has expired or the session is invalid." })
    }
  }).catch((e) => {
    res.status(401).send(e);
  });
}

// END MIDDLEWARES

const { List, Task, User } = require('./db/models');

//LISTS
app.get('/lists', authenticate, (req, res) => {
  List.find({
    // _userId: req.user_id
  }).then((lists) => {
    res.send(lists)
  })
});

app.post('/lists', authenticate, (req, res) => {
  let title = req.body.title;
  let newList = new List({
    title,
    _userId: req.user_id
  });
  newList.save().then(listDoc => {
    res.send(listDoc)
  })
});

app.patch('/lists/:id', authenticate, (req, res) => {
  List.findOneAndUpdate(
    { _id: req.params.id, _userId: req.user_id },
    { $set: req.body }
  ).then(() => {
    res.send({ message: 'Update sucessfully!'})
  }).catch(() => {
    res.send({ success: false, message: 'Update error!'})
  })
});

app.delete('/lists/:id', authenticate, (req, res) => {
  List.findOneAndRemove({
    _id: req.params.id,
    _userId: req.user_id
  }).then(removedListDoc => {
    res.send(removedListDoc);
    deleteTasksFromList(removedListDoc._id);
  })
});


//TASKS
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
  Task.find({
    _listId: req.params.listId
  }).then(tasks => {
    res.send(tasks)
  })
});

app.post('/lists/:listId/tasks', authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if(list) {
      return true;
    } else {
      return false;
    }
  }).then(canCreateTask => {
    if(canCreateTask) {
      let newTask = new Task({
        title: req.body.title,
        _listId: req.params.listId
      });
      newTask.save().then((newTaskDoc) => {
        res.send(newTaskDoc)
      });
    } else {
      res.sendStatus(404);
    }
  })
});

app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if(list) {
      return true;
    } else {
      return false;
    }
  }).then((canUpdateTask) => {
    if(canUpdateTask) {
      Task.findOneAndUpdate(
        {
          _id: req.params.taskId,
          _listId: req.params.listId
        },
        { $set: req.body }
      ).then(() => {
        res.send({ message: 'Update sucessfully!'})
      })    
    } else {
      res.sendStatus(404);
    }
  });
});

app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if(list) {
      return true;
    } else {
      return false;
    }
  }).then((canDeleteTask) => {
    if(canDeleteTask) {
      Task.findOneAndRemove({
        _id: req.params.taskId,
        _listId: req.params.listId
      }).then(removedTaskList => {
        res.send(removedTaskList);
      });
    } else {
      res.sendStatus(404);
    }
  });
});

//GET SPECIFIC TASK
app.get('/lists/:listId/tasks/:taskId', (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if(list) {
      return true;
    } else {
      return false;
    }
  }).then((canGetTask) => {
    if(canGetTask) {
      Task.findOne({
        _id: req.params.taskId,
        _listId: req.params.listId
      }).then(taskDoc => {
        res.send(taskDoc)
      });
    } else {
      res.sendStatus(404);
    }
  });
});


// USER ROUTES
app.post('/users', (req, res) => {
  let body = req.body;
  let newUser = new User(body);

  newUser.save().then(() => {
    return newUser.createSession();
  }).then((refreshToken) => {
    return newUser.generateAccessAuthToken().then((accessToken) => {
      return {accessToken, refreshToken};
    });
  }).then((authTokens) => {
    res.header('x-refresh-token', authTokens.refreshToken)
    .header('x-access-token', authTokens.accessToken)
    .send(newUser);
  }).catch((e) => {
    res.status(400).send(e);
  })
});

app.post('/users/login', (req, res) => {
  let email = req.body.email;
  let password = req.body.password;
  User.findByCredentials(email, password).then((user) => {
    return user.createSession().then((refreshToken) => {
      return user.generateAccessAuthToken().then((accessToken) => {
        return {accessToken, refreshToken};
      });
    }).then((authTokens) => {
      res.header('x-refresh-token', authTokens.refreshToken)
      .header('x-access-token', authTokens.accessToken)
      .send(user);
    }).catch((e) => {
      res.status(400).send(e);
    });
  });
});

app.get('/users/me/access-token', verifySession, (req, res) => {
  req.userObject.generateAccessAuthToken().then((accessToken) => {
    res.header('x-access-token', accessToken).send({ accessToken });
  }).catch(e => {
    res.status(400).send(e);
  }) 
})


// HELPER METHODS
let deleteTasksFromList = (_listId) => {
  Task.deleteMany({
    _listId
  })
}


app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});