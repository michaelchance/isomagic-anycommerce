(function(){
	// Only Node.JS has a process variable that is of [[Class]] process 
	var isNode = false;
	try {isNode = Object.prototype.toString.call(global.process) === '[object process]';} catch(e) {}
	if(isNode){	root = {};}
	else {root = window;}

	var XMLHttpRequest = root.XMLHttpRequest || require('xmlhttprequest').XMLHttpRequest;
	
	function API(options){
		options = options || {};
		this._apiurl = options.apiurl || "/api/";
		this._clientid = options.clientid || "sad";
		this._version = options.version || 201501;
		this._session = new Date().getTime();
		this._requestNumber = 0;
		this._uuid = 0;
		this.pipelineSize = options.pipelineSize || 20;
		
		this.queue = [];
			
		}

	API.prototype._pipeline = function(){
		var r = {
			req : {
				_clientid : this._clientid,
				_version : this._version,
				_uuid : this._uuid++,
				_cmd : "pipeline",
				"@cmds" : []
				},
			url : this._apiurl+"v-"+this._version+"/"
			}
		if(this._session){
			r.req._session = this._session;
			}
		return r;
		}

	API.prototype.enqueue = function(request, callback){
		if(request){
			var id = new Date().getTime() + "" + this._requestNumber++;
			callback = callback || function(){};
			this.queue.push({
				id : id,
				request : request,
				callback : callback
				});
			return id;
			}
		else {
			return null;
			}
		}

	API.prototype.dispatch = function(finalCallback){
		finalCallback = finalCallback || function(){};
		//Empty the queue
		var q = this.queue.slice();
		this.queue = [];
		//build pipeline requests
		var currPipe = -1;
		var pipes = [];
		var pipeMap = [];
		for(var i in q){
			if(currPipe < 0 || pipes[currPipe].req['@cmds'].length >= this.pipelineSize){
				currPipe++;
				pipes[currPipe] = this._pipeline();
				pipeMap[currPipe] = [];
				}
			var requestObj = q[i];
			pipes[currPipe].req['@cmds'].push(requestObj.request);
			pipes[currPipe].url += requestObj.request._cmd+"-";
			pipeMap[currPipe].push(requestObj);
			}
		//dispatch them
		var complete = new Array(pipes.length);
		for(var i in complete){
			complete[i] = false;
			}
		var finalData = {};
		
		var _self = this;
		for(var i in pipes){
			setTimeout((function(index){
				return function(){
					var request = new XMLHttpRequest();
					request.open('POST',pipes[index].url);
					request.setRequestHeader('Content-Type','application/json');
					request.onreadystatechange = function(){
						if(request.readyState == 4 && request.status == 200 && !complete[index]){
							// console.log(request.responseText);
							var r = JSON.parse(request.responseText);
							for(var i in r['@rcmds']){
								var data = r['@rcmds'][i];
								var requestObj = pipeMap[index][i];
								finalData[requestObj.id] = data;
								requestObj.callback(data);
								}
							//check for final completion
							complete[index] = true;
							var done = true;
							for(var i = 0; i < complete.length; i++){
								if(!complete[i]){
									done = false;
									break;
									}
								}
							if(done){
								finalCallback(finalData);
								}
							}
						}
					// console.log(JSON.stringify(pipes[index]));
					request.send(JSON.stringify(pipes[index].req));
					}
				})(i),i*20)
			}
		}
	if(isNode){
		module.exports = API;
		}
	else {
		window.apiClient = API;
		}
	})()