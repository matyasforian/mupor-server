var express        = require('express');
var multer         = require('multer');
var fs             = require('fs');
var gm             = require('gm');
var bodyParser     = require('body-parser');
var methodOverride = require('method-override');
var cors           = require('cors');
var upload         = multer({ dest: 'uploads/' });

var app = express();
var router = express.Router();

var whitelist = ['http://localhost:4200', 'http://mupor.hopto.org:3000'];
var corsOptions = {
	origin: function (origin, callback) {
		if (whitelist.indexOf(origin) !== -1) {
			callback(null, true)
		} else {
			callback(new Error('Not allowed by CORS'))
		}
	},
	credentials: true
};

app.use(cors(corsOptions));
var start = 0;

var resolutions = [
    {name: 'preview_xxs', height: 375},
    {name: 'preview_xs', height: 768},
    {name: 'preview_s', height: 1080},
    {name: 'preview_m', height: 1600},
    {name: 'preview_l', height: 2160},
    {name: 'preview_xl', height: 2880},
    {name: 'raw', height: undefined}
];

makeDir('images');
makeDir('uploads');

app.get('/test', function(req, res) {
	console.log('test called');
	res.json({ message: 'hooray! welcome to our api!' });
});

app.post('/add', upload.single('image'), function (req, res, next) {
	try {
		var start = new Date();
		console.log('add image', req.file, req.body);
		processImage(req.file.path, req.file.originalname, req.body.artist).then(function(result) {
            deleteFile(req.file.path);
			console.log('Image uploaded: ', req.body.artist, req.file.originalname, new Date() - start);
            res.status(200).send({result: 'success'});
		}, function(reason) {
    	    console.error('Error found while process', req.body.artist, req.file.originalname, error);
			next(reason);
		});
	} catch (error) {
	    console.error('Error found while image upload', req.body.artist, req.file.originalname, error);
		next(error);
	}
});

app.post('/:artist/addFile', upload.single('file'), function (req, res, next) {
	try {
		var start = new Date();
		var artist = req.params.artist;
		var file = req.file.originalname;
		console.log('add file', req.file, req.body);
		var dir = checkCreateDirs(artist);
        fs.createReadStream(req.file.path).pipe(fs.createWriteStream('images/' + artist + '/raw/' + file));
        deleteFile(req.file.path);
        console.log('File uploaded', req.body.artist, req.file.originalname, new Date() - start);
        res.status(200).send({result: 'success'});
	} catch (error) {
    	console.error('Error found while file upload', req.body.artist, req.file.originalname, error);
		next(error);
	}
});

app.delete('/delete/:artist/:image', function(req, res) {
	try {
	    var deleted = 0;
		resolutions.forEach(function(val) {
			var path = 'images/' + req.params.artist + '/' + val.name + '/' + req.params.image;
			deleteFile(path);
			deleted++;
		});
        console.log('Images deleted', req.params.artist, req.params.image, deleted);
        res.status(200).send({result: 'success'});
	} catch (error) {
    	console.error('Error found while delete images', req.params.artist, req.params.image, error);
		next(error);
	}
});

app.delete('/deleteFile/:artist/:file', function(req, res) {
	try {
        deleteFile('images/' + req.params.artist + '/raw/' + req.params.file);
        console.log('File deleted', req.params.artist, req.params.file);
        res.status(200).send({result: 'success'});
	} catch (error) {
    	console.error('Error found while delete file', req.params.artist, req.params.file, error);
		next(error);
	}
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(function (err, req, res, next) {
	console.error('err', err);
	res.status(500).send({ error: err });
});

app.use(express.static('images'));

app.use(function(req, res, next) {
	res.status(404).send("Undefined url");
});

app.listen(3000, function () {
  console.log('MUPOR server listening on port 3000!')
});

function deleteFile(filePath) {
   fs.unlink(filePath,function(err){
        if(err) {
            return console.error('Error found while delete file ', filePath, err);
        }
        console.log('File deleted successfully', filePath);
   });
}

function checkCreateDirs(artist) {
	var dir = 'images/' + artist;
	if (makeDir(dir)) {
		resolutions.forEach(function(val) {
			var dir = 'images/' + artist + '/' + val.name;
			makeDir(dir);
		});
	}
	return dir;
}

function makeDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, 0744);
		return true;
	} else {
		return false;
	}
}

function processImage(filePath, file, artist) {
	if (!artist) {
		throw 'artist not defined';
	}
	return new Promise((resolve, reject) => {
		checkCreateDirs(artist);
		gm(filePath)
			.identify(function (err, features) {
				if (err) {
					console.log(filePath)
					console.log(err)
					reject(err);
				}

				// copy raw image to assets folder
				fs.createReadStream(filePath).pipe(fs.createWriteStream('images/' + artist + '/raw/' + file));
				var promises = [];
				for (var i=0; i<resolutions.length-1; i++) {
					var r = resolutions[i];
					promises.push(createPreviewImage(filePath, file, r.height, r.name, artist));
				}
				Promise.all(promises).then(function(val) {
					resolve(true);
				}, function(reason) {
					reject(reason);
				});
			});
	});
}

function createPreviewImage(filePath, file, rheight, rname, artist) {
	return new Promise((resolve, reject) => {
		gm(filePath)
			.resize(null, rheight)
			.quality(95)
			.autoOrient()
			.write('images/' + artist + '/' + rname + '/' + file, function (err) {
				if (err) {
					reject(err);
				} else {
					resolve(true);
				}
			});
	});
}
