var express        = require('express');
var multer         = require('multer');
var fs             = require('fs');
var gm             = require('gm');
var bodyParser     = require('body-parser');
var methodOverride = require('method-override');
var upload         = multer({ dest: 'uploads/' });

var app = express();

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

app.post('/add', upload.single('image'), function (req, res, next) {
	try {
		res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
		console.log('add image', req.file, req.body);
		processImage(req.file.path, req.file.originalname, req.body.artist);
		res.status(200).send({test: 'profile'});
	} catch (error) {
		next(error);
	}
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(function (err, req, res, next) {
   res.status(500).send({ error: err });
});

app.use(express.static('images'));

app.use(function(req, res, next) {
	res.status(404).send("Undefined url");
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
});

function checkCreateDirs(artist) {
	let dir = 'images/' + artist;
	if (makeDir(dir)) {
		resolutions.forEach(function(val) {
			let dir = 'images/' + artist + '/' + val.name;
			makeDir(dir);
		});
	}
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
	checkCreateDirs(artist);
    gm(filePath)
        .identify(function (err, features) {
            if (err) {
                console.log(filePath)
                console.log(err)
                throw err;
            }

            // copy raw image to assets folder
			fs.createReadStream(filePath).pipe(fs.createWriteStream('images/' + artist + '/raw/' + file));
            createPreviewImage(filePath, file, 0, artist);
        });
}

function createPreviewImage(filePath, file, index, artist) {
    // create various preview images

    gm(filePath)
        .resize(null, resolutions[index].height)
        .quality(95)
        .write('images/' + artist + '/' + resolutions[index].name + '/' + file, function (err) {
            if (err) throw err;
            if (index !== resolutions.length - 2) {
                // don't resize raw images
                createPreviewImage(filePath, file, ++index, artist);
            } else {
                console.log('\rConverted ' + file + " images.");
            }
        });
}
