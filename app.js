require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");
const passportLocalMongoose = require("passport-local-mongoose");
const { use } = require("passport");
const list_of_tasks = require("./list_of_tasks.js").list_of_tasks;

const app = express();
app.use(flash());

app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(
  session({
    secret: "My little secret.",
    resave: false,
    saveUninitialized: false,
    cookie: {},
  })
);

app.use(passport.initialize()); // Middlewares -> Adds the user object to the req
app.use(passport.session());

/*** Test *****/
/*
app.use((req,res,next) => {
  console.log(req.session);
  console.log(req.user);
  next();
});*/

/**************/

mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useNewUrlParser", true);
mongoose.set("useFindAndModify", false);
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
  fname: String,
  lname: String,
  dob: String,
  username: String,
  class: String,
  password: String,
  cpassword: String,
  tasks: [],
});

userSchema.plugin(passportLocalMongoose);
const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.use(
  new LocalStrategy(
    {
      usernameField: "username",
    },
    User.authenticate()
  )
);

passport.serializeUser(User.serializeUser()); // Fetch the user validity from database
passport.deserializeUser(User.deserializeUser());

/*********************** HOME******************************/

app.get("/", function (req, res) {
  // res.sendFile(__dirname + '/index.html');
  res.render("index");
});

/********************* REGISTER ****************************/

app.get("/register", function (req, res) {
  res.render("register");
});

var checkJoinCode = async function (req, res, next) {
  if (req.body.code == process.env.JOINING_CODE) {
    next();
  } else {
    res.render("register", {
      err: "Please enter a valid joining code!",
    });
  }
};

app.post("/register", checkJoinCode, function (req, res) {
  var error;
  const password = req.body.password;
  const cpassword = req.body.cpassword;
  if (password !== cpassword) {
    console.log("password not matched");
    error = "Passwords don't match!";
    res.render("register", {
      err: error,
    });
  } else {
    var p1 = new Promise(function (resolve, reject) {
      var _class = "";
      const admins = process.env.ADMIN_USERNAME.split(",");
      const found = admins.find((element) => element === req.body.username);
      if (found) {
        resolve("ADMIN");
      } else {
        resolve(req.body.class);
      }
    });

    p1.then(function (_class) {
      User.register(
        {
          username: req.body.username,
          fname: req.body.fname,
          lname: req.body.lname,
          dob: req.body.dob,
          class: _class,
          tasks: list_of_tasks,
        },
        req.body.password,
        function (err, user) {
          if (err) {
            console.log(err.name);
            error =
              "Your email is already registered! Try using another email.";
            res.render("register", {
              err: error,
            });
          } else {
            passport.authenticate("local")(req, res, function () {
              console.log(user);
              res.redirect("/dashboard");
            });
          }
        }
      );
    });
  }
});

/************************** LOGIN ****************************/

app.get("/login", function (req, res) {
  // res.sendFile(__dirname + '/login.html');
  res.render("login");
});

app.get("/login-failure", function (req, res) {
  const error = "Incorrect Credentials! Please provide correct email/password.";
  res.render("login", {
    err: error,
  });
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/login-failure",
    failureFlash: true,
  })
);

/************************** LOGOUT ****************************/

app.get("/logout", function (req, res) {
  console.log(req.body);
  req.logout(); // deletes req.session.passport.user

  res.redirect("/");
});

/************************** ADMIN FACILITIES ****************************/

app.get("/admin/dashboard", async function (req, res) {
  // res.sendFile(__dirname + '/login.html');
  if (req.isAuthenticated()) {
    try {
      const studentlist = await findStudentList();
      res.render("adminDashboard", { studentlist: studentlist });
    } catch (err) {
      console.log("At /admin/dashboard \n" + err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/getstudent/:studentid", async function (req, res) {
  // res.sendFile(__dirname + '/login.html');
  if (req.isAuthenticated()) {
    const tasklist = await findTaskListAdmin(req.params.studentid);
    res.render("adminTasklist", {
      studentid: req.params.studentid,
      tasklist: tasklist,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/getstudent/:studentid/:taskid", async function (req, res) {
  if (req.isAuthenticated()) {
    try {
      const sentencelist = await findSentenceList(
        req.params.studentid,
        req.params.taskid
      );
      res.render("task-performance", {
        sentencelist: sentencelist,
        taskid: req.params.taskid,
      });
    } catch (err) {
      console.log("At /admin/getstudent/:studentid/:taskid \n" + err);
      res.redirect("/admin/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

function findStudentList() {
  return new Promise(function (resolve, reject) {
    var studentlist = [];
    User.find({}, function (err, users) {
      if (err) {
        reject(err);
      } else {
        users.forEach(function (user) {
          studentlist.push({
            id: user._id,
            username: user.username,
            fname: user.fname,
            lname: user.lname,
            class: user.class,
            dob: user.dob,
          });
        });

        resolve(studentlist);
      }
    });
  });
}

function findTaskListAdmin(userid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const tasklistlength = user.tasks.length;

            var tasklist_0_1 = [];
            for (var i = 0; i < tasklistlength; i++) {
              tasklist_0_1.push([
                user.tasks[i].sentenceList.length,
                user.tasks[i].status,
              ]);
            }

            resolve(tasklist_0_1);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/************************* DASHBOARD ***************************/

var checkAdmin = function (req, res, next) {
  try {
    const admins = process.env.ADMIN_USERNAME.split(",");
    const found = admins.find((element) => element === req.user.username);
    if (found) {
      console.log("matched");
      res.redirect("/admin/dashboard");
    } else {
      next();
    }
  } catch (err) {
    res.render("Bad request");
  }
};

app.get("/dashboard", checkAdmin, async function (req, res) {
  if (req.isAuthenticated()) {
    res.render("dashboard", { fname: req.user.fname });
  } else {
    res.redirect("/login");
  }
});

/************************* PROFILE ***************************/
var checkAdminProfile = function (req, res, next) {
  try {
    const admins = process.env.ADMIN_USERNAME.split(",");
    const found = admins.find((element) => element === req.user.username);
    if (found) {
      console.log("matched");
      res.redirect("/admin/profile");
    } else {
      next();
    }
  } catch (err) {
    res.render("Bad request");
  }
};

app.get("/profile", checkAdminProfile, function (req, res) {
  if (req.isAuthenticated()) {
    User.findById(req.user._id, function (err, user) {
      if (err) {
        console.log("At get /profile \n" + err);
        res.redirect("/dashboard");
      } else {
        res.render("profile", {
          username: user.username,
          fname: user.fname,
          lname: user.lname,
          dob: user.dob,
          _class: user.class,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/profile", function (req, res) {
  if (req.isAuthenticated()) {
    User.findById(req.user._id, function (err, user) {
      if (err) {
        console.log("At get /admin/profile \n" + err);
        res.redirect("/dashboard");
      } else {
        res.render("admin-profile", {
          username: user.username,
          fname: user.fname,
          lname: user.lname,
          dob: user.dob,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/profile", async function (req, res) {
  if (req.isAuthenticated()) {
    User.findByIdAndUpdate(
      req.user._id,
      {
        fname: req.body.fname,
        lname: req.body.lname,
        dob: req.body.dob,
        class: req.body.class,
      },
      function (err, user) {
        if (err) {
          console.log("At post /profile \n" + err);
          res.redirect("/dashboard");
        } else {
          res.redirect("/dashboard");
        }
      }
    );
  } else {
    res.redirect("/login");
  }
});

app.get("/changePassword", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("changePassword");
  } else {
    res.redirect("/login");
  }
});

app.post("/changePassword", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.body.newpassword != req.body.cnewpassword) {
      res.render("changePassword", { err: "Confirm password doesn't match!" });
    } else {
      User.findById(req.user._id)
        .then((user) => {
          user
            .changePassword(req.body.oldpassword, req.body.newpassword)
            .then(() => {
              console.log("password changed");
              res.render("profile", {
                username: user.username,
                fname: user.fname,
                lname: user.lname,
                dob: user.dob,
                _class: user.class,
                success: "Changed password sucessfully!",
              });
            })
            .catch((err) => {
              console.log("At post /changePassword 1 \n" + err);
              res.render("changePassword", {
                err: "Existing password is incorrect!",
              });
            });
        })
        .catch((err) => {
          console.log("At post /changePassword 2 \n" + err);
          res.redirect("/profile");
        });
    }
  } else {
    res.redirect("/login");
  }
});

/************************* PERFORMANCE DETAILS ***************************/

app.get("/performance", async function (req, res) {
  if (req.isAuthenticated()) {
    try {
      const tasklist = await findTaskList_0_1(req.user._id);
      res.render("performance", { tasklist: tasklist });
    } catch (err) {
      console.log("At /performance \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/performance/:taskid", async function (req, res) {
  if (req.isAuthenticated()) {
    try {
      const sentencelist = await findSentenceList(
        req.user._id,
        req.params.taskid
      );
      res.render("task-performance", {
        sentencelist: sentencelist,
        taskid: req.params.taskid,
      });
    } catch (err) {
      console.log("At /performance/:taskid \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

/*--------------- Utility Functions ----------------*/

function findTaskList_0_1(userid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const tasklistlength = user.tasks.length;

            var tasklist_0_1 = [];
            for (var i = 0; i < tasklistlength; i++) {
              tasklist_0_1.push(user.tasks[i].status);
            }

            resolve(tasklist_0_1);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function findSentenceList(userid, taskid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const sentlist = user.tasks[taskid].sentenceList;
            //console.log(sentlistlength);
            resolve(sentlist);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/************************* TASK LIST ***************************/

app.get("/tasklist", async function (req, res) {
  if (req.isAuthenticated()) {
    try {
      const tasklist = await findTaskList_0_1(req.user._id);
      res.render("tasklist", { tasklist: tasklist });

      /*
      const tasklistlength = await findTaskListLength(req.user._id);
      res.render("tasklist",{tasklistlength:tasklistlength});
      */
    } catch (err) {
      console.log("At /tasklist \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

/*--------------- Utility Functions ----------------*/

function findTaskListLength(userid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const tasklistlength = user.tasks.length;
            resolve(tasklistlength);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/*************************** PERFORM TASK *****************************/

app.get("/task/:taskid", async function (req, res) {
  if (req.isAuthenticated()) {
    try {
      User.findById(req.user._id, function (err, user) {
        if (err) {
          console.log("At /task/:taskid \n" + err);
          res.redirect("/dashboard");
        } else {
          res.redirect("/task/" + req.params.taskid + "/0");
        }
      });
    } catch (err) {
      console.log("At /task/:taskid \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

var checkStatus = async function (req, res, next) {
  if (req.isAuthenticated()) {
    const _user = await User.findById(req.user._id);
    if (_user.tasks[req.params.taskid].status == 1) {
      res.send("Task Completed!");
    } else {
      next();
    }
  } else {
    res.redirect("/login");
  }
};

app.get("/task/:taskid/:sentid", async function (req, res) {
  if (req.isAuthenticated()) {
    const taskid = req.params.taskid;
    const sentid = req.params.sentid;
    try {
      const _user = await User.findById(req.user._id);
      if (sentid >= _user.tasks[taskid].sentenceList.length) {
        _user.tasks[taskid].status = 1;
        await User.findByIdAndUpdate(
          req.user._id,
          { tasks: _user.tasks },
          function (err, user) {
            if (err) {
              console.log(err);
              throw err;
            } else {
              res.render("task-complete");
            }
          }
        );
      } else {
        const sentence = await findSentence(
          req.user._id,
          req.params.taskid,
          req.params.sentid
        );

        //console.log(sentence);
        res.render("task", {
          text: sentence,
          taskid: taskid,
          sentid: sentid,
          wordno: 0,
          startValid: 1,
          nextValid: 0,
          inputCheck: 0,
        });
      }
    } catch (err) {
      console.log("At /:taskid/:sentid \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/task/:taskid/:sentid/0/next", async function (req, res) {
  if (req.isAuthenticated()) {
    const taskid = req.params.taskid;
    const sentid = req.params.sentid;
    var user_tasks;

    try {
      const sentence = await findSentence(
        req.user._id,
        req.params.taskid,
        req.params.sentid
      );
      const _user = await User.findById(req.user._id);

      _user.tasks[taskid].sentenceList[sentid].words[0].finishTime = new Date();
      user_tasks = _user.tasks;

      await User.findByIdAndUpdate(
        req.user._id,
        { tasks: user_tasks },
        function (err, user) {
          if (err) {
            console.log(err);
            throw err;
          } else {
            console.log(
              user.tasks[taskid].sentenceList[sentid].words[0].finishTime
            );
            res.render("task", {
              text: sentence,
              taskid: taskid,
              sentid: sentid,
              wordno: 1,
              startValid: 0,
              nextValid: 1,
              inputCheck: 0,
            });
          }
        }
      );
    } catch (err) {
      console.log("At /:taskid/:sentid/0/next \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/task/:taskid/:sentid/:wordno/next", async function (req, res) {
  if (req.isAuthenticated()) {
    //const inputWord=req.body.word;
    const taskid = req.params.taskid;
    const sentid = req.params.sentid;
    const wordno = req.params.wordno;
    var word;
    var prevTime;
    var sentLength;
    var user_tasks;
    var sentence;
    //console.log(0.9);

    var p1 = new Promise(async function (resolve, reject) {
      try {
        //console.log(1);
        user_tasks = await findTasks(req.user._id);
        //console.log(2);
        sentLength = user_tasks[taskid].sentenceList[sentid].words.length;
        word =
          user_tasks[taskid].sentenceList[sentid].words[parseInt(wordno)].word;
        prevTime =
          user_tasks[taskid].sentenceList[sentid].words[parseInt(wordno) - 1]
            .finishTime;
        sentence = await findSentence(req.user._id, taskid, sentid);
        resolve(word);
      } catch (err) {
        reject(err);
      }
    })
      .then(async function (word) {
        //console.log(4);
        //if(inputWord==word)
        {
          const newTime = await new Date();
          const interval = (newTime - prevTime) / 1000;
          user_tasks[taskid].sentenceList[sentid].words[
            parseInt(wordno)
          ].finishTime = await newTime;
          user_tasks[taskid].sentenceList[sentid].words[
            parseInt(wordno)
          ].timeTaken = interval;
          //console.log(5+" "+inputWord+" "+word);
        }
      })
      .then(function () {
        {
          User.findByIdAndUpdate(
            req.user._id,
            { tasks: user_tasks },
            function (err, user) {
              if (err) {
                reject(err);
              }
              //console.log("\n"+parseInt(wordno)-1+" "+user.tasks[taskid].sentenceList[sentid].words[parseInt(wordno)-1].finishTime);
              //console.log(+parseInt(wordno)+" "+user.tasks[taskid].sentenceList[sentid].words[parseInt(wordno)].finishTime+"\n");
              //console.log(6);
              console.log(
                "last word: " +
                  word +
                  " = " +
                  user.tasks[taskid].sentenceList[sentid].words[
                    parseInt(wordno)
                  ].timeTaken
              );
              if (wordno >= sentLength - 1) {
                //console.log(7);
                res.render("task", {
                  text: sentence,
                  taskid: taskid,
                  sentid: sentid,
                  wordno: parseInt(wordno) + 1,
                  startValid: 0,
                  nextValid: 0,
                  inputCheck: 0,
                });
                //console.log(8);
              } else {
                //console.log(8);
                res.render("task", {
                  text: sentence,
                  taskid: taskid,
                  sentid: sentid,
                  wordno: parseInt(wordno) + 1,
                  startValid: 0,
                  nextValid: 1,
                  inputCheck: 0,
                });
              }
              //console.log(9);
            }
          );
        }
        /*else{
        //console.log(10);
        res.render("task", {
          text : sentence,
          taskid: taskid,
          sentid: sentid,
          wordno:wordno,
          startValid:0,
          nextValid:1});
      } */
        //console.log(11);
      })
      .catch((err) => {
        console.log("At /:taskid/:sentid/:wordno/next \n" + err);
        res.redirect("/dashboard");
      });

    p1.catch((err) => {
      console.log("At /:taskid/:sentid/:wordno/next \n" + err);
      res.redirect("/dashboard");
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/task/:taskid/:sentid/submit", async function (req, res) {
  if (req.isAuthenticated()) {
    const taskid = req.params.taskid;
    const sentid = req.params.sentid;

    try {
      const _user = await User.findById(req.user._id);
      const sentence = await findSentence(
        req.user._id,
        req.params.taskid,
        req.params.sentid
      );
      if (sentence == req.body.sentence + " ") {
        var p1 = new Promise(function (resolve, reject) {
          _user.tasks[taskid].sentenceList[sentid].inputSentence =
            req.body.sentence;
          resolve();
          //return _user.tasks;
        })
          .then(function () {
            console.log(_user.tasks[taskid].sentenceList[sentid].inputSentence);
            User.findByIdAndUpdate(
              req.user._id,
              { tasks: _user.tasks },
              function (err, user) {
                if (err) {
                  console.log(err);
                  throw err;
                } else {
                  console.log(user.tasks[taskid].sentenceList[sentid]);
                  res.render("task", {
                    text: sentence,
                    taskid: taskid,
                    sentid: sentid,
                    wordno: 100,
                    startValid: 0,
                    nextValid: 0,
                    inputCheck: 1,
                  });
                }
              }
            );
          })
          .catch((err) => {
            console.log("At /:taskid/:sentid/submit \n" + err);
            res.redirect("/dashboard");
          });
      } else {
        res.render("task", {
          text: sentence,
          taskid: taskid,
          sentid: sentid,
          wordno: 100,
          startValid: 0,
          nextValid: 0,
          inputCheck: -1,
        });
      }
    } catch (err) {
      console.log("At /:taskid/:sentid \n" + err);
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

/*--------------- Utility Functions ----------------*/

function findSentence(userid, taskid, sentid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const sentenceObject =
              user.tasks[taskid].sentenceList[sentid].words;
            var sentence = "";
            for (var i = 1; i < sentenceObject.length; i++) {
              sentence = sentence + sentenceObject[i].word + " ";
            }
            resolve(sentence);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function findTasks(userid) {
  return new Promise((resolve, reject) => {
    User.findById(userid, function (err, user) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(user.tasks);
      }
    });
  });
}

function findUser(userid) {
  return new Promise((resolve, reject) => {
    User.findById(userid, function (err, user) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(user);
      }
    });
  });
}

function findWordList(userid, taskid, sentid) {
  return new Promise((resolve, reject) => {
    User.findById(userid, function (err, user) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        const sentenceObject = user.tasks[taskid].sentenceList[sentid].words;
        resolve(sentenceObject);
      }
    });
  });
}

function findSentenceListLength(userid, taskid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const sentlistlength = user.tasks[taskid].sentenceList.length;
            //console.log(sentlistlength);
            resolve(sentlistlength);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function findTheTask(userid, taskid) {
  return new Promise((resolve, reject) => {
    try {
      User.findById(userid, function (err, user) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          try {
            const task = user.tasks[taskid];
            //console.log(sentlistlength);
            resolve(task);
          } catch (err) {
            reject(err);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/****************************** TASK ********************************/
/*
app.get("/task/:taskid/:sentid", async function(req, res) {
  if(req.isAuthenticated()){
    try{
      const sentlistlength = await findSentenceListLength(req.user._id,req.params.taskid);
      if(req.params.sentid>=sentlistlength){
        res.send("No more sentences.");
      }
      else{
        const sentence = await findSentence(req.user._id,req.params.taskid,req.params.sentid);
        const no_of_words=await countWords(sentence);

        //console.log(sentence);
        res.render("perform",{taskid:req.params.taskid,sentid:req.params.sentid,sentence:sentence,no_of_words:no_of_words});
      }
    }
    catch(err){
      console.log("At /:taskid/:sentid \n"+ err);
      res.redirect("/dashboard");
    }
  }
  else{
    res.redirect("/login");
  }

});

function findSentence(userid,taskid,sentid){
  return new Promise((resolve,reject)=>{
    try{
      User.findById(userid,function(err, user){
        if(err){
          console.log(err);
          reject(err);
        }
        else{
          try{
            const sentenceObject = user.tasks[taskid].sentenceList[sentid].words;
            var sentence="";
            for(var i=1;i<sentenceObject.length;i++){
              sentence=sentence+sentenceObject[i].word+" ";
            }
            resolve(sentence+".");
          }
          catch(err){
            reject(err);
          }
        }
      });
    }
    catch(err){
      reject(err);
    }
  });
}

function countWords(sentence){
  return new Promise((resolve,reject)=>{
    const l=sentence.length;
    var count=0;
    for(var i=0;i<l;i++)
    {
      if(sentence[i]==' ')
      count++;
    }
    resolve(count);
  });
}


*/

/**************************************************************************/
const port = process.env.PORT || 3000;

app.listen(port, function () {
  console.log("Server is listening on port 3000");
});
