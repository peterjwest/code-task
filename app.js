var express = require('express');
var Git = require('nodegit');
var rmdir = require('rmdir');
var mongoose = require('mongoose');


mongoose.connect('mongodb://localhost/repos');
mongoose.Promise = global.Promise;

var Repo = mongoose.model('Repo', { url: String });
var Commit = mongoose.model('Commit', {
  date: Date,
  author: String,
  message: String,
  repo: { type: mongoose.Schema.Types.ObjectId, ref: 'Repo' },
});


var app = express();

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.post('/storeRepoDetails', function(req, res) {
  if (!req.body.repository) {
    return res.json({
      success: false,
      errorMessage: 'Parameter "repository" must contain a valid GIT URL',
    });
  }

  var removeTempDir = new Promise(function(resolve, reject) {
    rmdir('./tmp/', function(err) {
      if (err) return reject(err);
      return resolve();
    });
  });

  removeTempDir.then(function() {
    return Git.Clone(req.body.repository, './tmp');
  })
  .then(function(repo) {
    return Repo.create({ url: req.body.repository })
    .then(function(repoModel) {
      return repo.getMasterCommit().then(function(masterCommit) {
        var history = masterCommit.history();

        return new Promise(function(resolve, reject) {
          history.on('end', function(commits) {
            resolve(commits.map(function(commit) {
              return {
                date: commit.date(),
                author: commit.author().name(),
                message: commit.message(),
                repo: repoModel.id,
              };
            }));
          });

          history.start();
        });
      });
    });
  })
  .then(function(commits) {
    return Commit.collection.insert(commits);
  })
  .then(function() {
    return res.json({ success: true });
  })
  .catch(function(err) {
    return res.json({
      success: false,
      errorMessage: `Repository URL "${req.body.repository}"" could not be loaded`,
    });
  });
});

app.get('/wordsForAuthors', function(req, res) {
  if (!req.query.author) {
    return res.json([]);
  }

  Commit.find({ author: req.query.author }).select('message').exec()
  .then(function(commits) {
    var splitByWord = /[\s,.;'"!?`&()\[\]]+/;
    var words = {};
    commits.forEach(function(commit) {
      commit.message.split(splitByWord).forEach(function(word) {
        if (word) {
          words[word.toLowerCase()] = word;
        }
      });
    });

    res.json(Object.keys(words).map((key) => words[key]));
  }).catch(function(err) {
    return res.json([]);
  });
});

app.listen(3000);
