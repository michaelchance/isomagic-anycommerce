/******************************************************************************
 * @module isomagic-anycommerce
 *
 * REQUIRES 
 *		
 * @param {string} domain - domain to use for api url
 * @param {string} secureUrl - secureUrl for redirecting non-secure traffic
 * @param {int} mediaUrl - base to use for media requests
 * 
 * tlc:
 * 
 * middleware:
 *
 * TODO
 *		throw exceptions when api client fails, or settings aren't right
 *		dispatch options for middleware- allow delaying of dispatch for pipeline efficiency
 *		
 *****************************************************************************/

(function(){
	var extname = "anycommerce";
	
	var extension = function(_app, config){
		var r = {
			u : {
				updateCart : function(_cartid, callback){
					callback = callback || function(){};
					if(!_app.server()){
						if(_cartid != null){
							_app._cartid = _cartid;
							}
						_app.model.enqueue({"_cmd":"cartDetail","_cartid":_app._cartid},function(data){
							_app.cart = data;
							$('[data-app-cartupdate]').trigger('cartupdate',data);
							callback(data);
							});
						_app.model.dispatch();
						}
					else if(_cartid){
						callback = callback || function(){};
						_app.model.enqueue({"_cmd":"cartDetail","_cartid":_cartid},function(data){
							callback(data);
							});
						_app.model.dispatch();
						}
					else {
						callback(null);
						}
					}
				},
			tlc : {
				imageurl : function(context){
					var url = config.mediaUrl;
					
					var w = context.args('w');
					var h = context.args('h');
					var b = context.args('b');
					var name = context.args('name');
					if(!w && !h && !b){
						url +="-/";
						}
					else{
						if(w){ url+='W'+w+'-'; }
						if(h){ url+='H'+h+'-'; }
						if(b){ url+='B'+b+'-'; }
						}
					if(url.charAt(url.length-1) == '-'){
						url = url.slice(0,url.length-1);
						}
					if(url.charAt(url.length-1) != '/'){
						url += '/';
						}
					url+=name;
					
					context.focus(url);
					return true;
					}
				},
			middleware : {
				cart : function(req,res,next){
					var _cartid = "";
					if(_app.server()){
						if(req.query._cartid){
							_app.ext.anycommerce.u.updateCart(req.query._cartid, function(data){
								res.data.cart = data;
								next();
								});
							}
						else {
							//This is an error, we can't fetch the cart
							//res.redirect();
							}
						}
					else{
						_app.ext.anycommerce.u.updateCart(req.query._cartid, function(){
							next();
							});
						}
					},
				prepdata : function(req,res,next){
					if(!_app.server()){
						res.data.cart = _app.cart;
						res.data.session = _app.session;
						}
					next();
					}
				},
			middlewareBuilders : {
				category : function(opts){
					opts.datapointer = opts.datapointer || "category";
					opts.navcat = opts.navcat || ':navcat';
					return (function(datapointer, navcat){							
						return function(req,res,next){
							var n = "";
							if(navcat.charAt(0) == ':'){
								n = req.params[navcat.substring(1)];
								}
							else {
								n = navcat;
								}
							var navcatDetail = _app.model.enqueue({
								"_cmd" : "appNavcatDetail",
								"path" : n,
								"detail" : "max"
								});
							var pageGet = _app.model.enqueue({
								"_cmd" : "appPageGet",
								"PATH" : n,
								"all" : 1
								});
							_app.model.dispatch(function(dataArr){
								res.data[datapointer] = dataArr[navcatDetail];
								//console.dir(dataArr[pageGet]);
								res.data[datapointer]['%page'] = dataArr[pageGet]['%page'];
								next();
								});
							};
						})(opts.datapointer, opts.navcat)
					},
				product : function(opts){
					opts.datapointer = opts.datapointer || "product";
					opts.pid = opts.pid || ':pid';
					return (function(datapointer, pid){						
						return function(req,res,next){
							var p = "";
							if(pid.charAt(0) == ':'){
								p = req.params[pid.substring(1)];
								}
							else {
								p = pid;
								}
							_app.model.enqueue({
								"_cmd" : "appProductGet",
								"withVariations" : 1,
								"withInventory" : 1,
								"pid" : p
								},function(data){
								res.data[datapointer] = data;
								});
							_app.model.dispatch(function(){next();});
							};
						})(opts.datapointer, opts.pid)
					},
				searchKeyword : function(opts){
					opts.datapointer = opts.datapointer || "search";
					opts.keywords = opts.keywords || ':keywords';
					opts.size = opts.size || 50;
					return (function(datapointer, keywords, size){						
						return function(req,res,next){
							var k = "";
							if(keywords.charAt(0) == ':'){
								k = req.params[keywords.substring(1)];
								}
							else {
								k = keywords;
								}
							_app.model.enqueue({
								"_cmd" : "appPublicSearch",
								"type" : "product",
								"mode" : "elastic-search",
								"size" : size,
								"query":{
									"function_score" : {										
										"query" : {
											"query_string":{"query":k}	
											},
										"functions" : [
											{
												"filter" : {"query" : {"query_string":{"query":'"'+k+'"'}}},
												"script_score" : {
													"script":"constant",
													"params":{"constant":10}
													},
												}
											],
										"boost_mode" : "sum",
										}
									}
								},function(data){
								res.data[datapointer] = data;
								});
							_app.model.dispatch(function(){next();});
							};
						})(opts.datapointer, opts.keywords, opts.size)
					},
				searchTags : function(opts){
					opts.datapointer = opts.datapointer || "search";
					opts.tag = opts.tag || ':tag';
					opts.size = opts.size || 50;
					return (function(datapointer, tag, size){						
						return function(req,res,next){
							var t = "";
							if(tag.charAt(0) == ':'){
								t = req.params[tag.substring(1)];
								}
							else {
								t = tag;
								}
							_app.model.enqueue({
								"_cmd" : "appPublicSearch",
								"type" : "product",
								"mode" : "elastic-search",
								"size" : size,
								"filter" : {"term":{"tags":t}}
								},function(data){
								res.data[datapointer] = data;
								});
							_app.model.dispatch(function(){next();});
							};
						})(opts.datapointer, opts.tag, opts.size)
					}
				}
			}
		if(!config.domain || !config.mediaUrl){
			//throw an exception
			}
		var apiClient = root.apiClient || require('./api-client');
		var apiurl = _self.server() ? "http://" : "//";
		apiurl += config.domain+"/jsonapi/"
		_app.model = new apiClient({
			apiurl : apiurl
			});
			
		if(!_app.server()){
			//parse the uriParams -- this only works for flat data, and no queries in the hash.
			_app.uriParams = {};
			var query = location.search.substr(1).split('&');
			for(var i in query){
				var item = query[i].split('=');
				if(item.length == 2){
					_app.uriParams[item[0]] = decodeURIComponent(item[1]);
					}
				}
			//fetch cart from 1) url, 2) localstorage, 3) get a new one
			//in case 1 or 2, check validity of cart
			var _cartid = "";
			if(_app.uriParams._cartid){
				_cartid = _app.uriParams._cartid;
				}
			else if(window.localStorage && window.localStorage.getItem('_cartid')){
				_cartid = window.localStorage.getItem('_cartid');
				}
			else {
				//we'll have to make a new one, do nothing
				}
			if(_cartid){
				_app.model.enqueue({"_cmd":"appCartExists","_cartid":_cartid},function(data){
					if(data.exists){
						_app.ext.anycommerce.u.updateCart(data._cartid);
						}
					else {
						_app.model.enqueue({"_cmd":"appCartCreate"},function(data){
							_app.ext.anycommerce.u.updateCart(data._cartid);
							});
						}
					});
				}
			else{
				_app.model.enqueue({"_cmd":"appCartCreate"},function(data){
					_app.ext.anycommerce.u.updateCart(data._cartid);
					});
				}
			}
		var mwcache = {};
		return r;
		}
	// Only Node.JS has a process variable that is of [[Class]] process 
	var isNode = false;
	try {isNode = Object.prototype.toString.call(global.process) === '[object process]';} catch(e) {}
	if(isNode){	root = {};}
	else {root = window;}
	
	if(isNode){
		module.exports = extension;
		}
	else {
		window[extname] = extension;
		}
	
	})()