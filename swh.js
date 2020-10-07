var inputElement = document.getElementById("document");
inputElement.addEventListener("change", handleFiles, false);
var zip = new JSZip();

function list_results(file, license) {
    var ul = document.getElementById("results");
    var li = document.createElement('li');
    li.setAttribute('class', license ? "found" : "notfound");
    li.textContent = file.name + " "
    console.log(li.textContent)
    li.textContent += license ? license : "";
    ul.appendChild(li);
}

function handleFiles() {
    zip.loadAsync( this.files[0] /* = file blob */)
     .then(function(zip) {
         zip.forEach(function (filename, zipEntry) {
             if (zipEntry.dir == false) {
                 zipEntry.async("blob").then(function (content) {
                     var file = new File([content], filename);
                     var SHA1 = CryptoJS.algo.SHA1.create();
                     var counter = 0;
                     loading(file,
                         function (data) {
                             var wordBuffer = CryptoJS.lib.WordArray.create(data);
                             SHA1.update(wordBuffer);
                             counter += data.byteLength;
                         }, function (data) {
                             var encrypted = SHA1.finalize().toString();
                             swh_api(file, encrypted, list_results)
                         });
                 });
             }
         })
     }, function() {alert("Not a valid zip file")});
};


function loading(file, callbackProgress, callbackFinal) {
    var offset     = 0;
    var chunkSize = 1024*1024;
    var size=chunkSize;
    var partial;
    var index = 0;

    if(file.size===0){
        callbackFinal();
    }
    while (offset < file.size) {
        partial = file.slice(offset, offset+size);
        var reader = new FileReader;
        reader.size = chunkSize;
        reader.offset = offset;
        reader.index = index;
        reader.onload = function(evt) {
            callbackRead_buffered(this, file, evt, callbackProgress, callbackFinal);
        };
        reader.readAsArrayBuffer(partial);
        offset += chunkSize;
        index += 1;
    }
}

var lastOffset = 0;
var chunkReorder = 0;
var chunkTotal = 0;

// memory reordering
var previous = [];
function callbackRead_buffered(reader, file, evt, callbackProgress, callbackFinal){
    chunkTotal++;

    if(lastOffset !== reader.offset){
        // out of order
        previous.push({ offset: reader.offset, size: reader.size, result: reader.result});
        chunkReorder++;
        return;
    }

    function parseResult(offset, size, result) {
        lastOffset = offset + size;
        callbackProgress(result);
        if (offset + size >= file.size) {
            lastOffset = 0;
            callbackFinal();
        }
    }

    // in order
    parseResult(reader.offset, reader.size, reader.result);

    // resolve previous buffered
    var buffered = [{}]
    while (buffered.length > 0) {
        buffered = previous.filter(function (item) {
            return item.offset === lastOffset;
        });
        buffered.forEach(function (item) {
            parseResult(item.offset, item.size, item.result);
            previous.remove(item);
        })
    }
}

function swh_api(file, sha1, callback){
    const Http = new XMLHttpRequest();
    const url='https://archive.softwareheritage.org/api/1/content/' + sha1;
    Http.open("GET", url);
    Http.send();
    Http.onreadystatechange = (e) => {
        if (Http.readyState == 4 && Http.status == 404) {
            callback(file, null)
        }
        if (Http.readyState == 4 && Http.status == 200 ){
            var response = JSON.parse(Http.responseText);
            get_license(response.license_url, file, callback)
        }
    }
}

function get_license(url, file, callback) {
    const Http = new XMLHttpRequest();
    Http.open("GET", url);
    Http.send();
    Http.onreadystatechange = (e) => {
        if (Http.readyState == 4 && Http.status == 200 ){
            JSON.parse(Http.responseText).facts.forEach(function(item){
                item.licenses.forEach(function(name){
                    callback(file, name)
                });
            });
        }
    }
}