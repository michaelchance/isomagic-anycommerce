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
			init : function(next){
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
						console.log('got it from local');
						}
					else {
						//we'll have to make a new one, do nothing
						}
					
					console.log(_cartid);
					if(_cartid){
						_app.model.updateCartId(_cartid);
						_app.model.enqueue({"_cmd":"appCartExists","_cartid":_cartid},function(data){
							if(data.exists){
								_app.ext.anycommerce.u.updateCart(data._cartid, next);
								}
							else {
								_app.model.enqueue({"_cmd":"appCartCreate"},function(data){
									_app.ext.anycommerce.u.updateCart(data._cartid, next);
									});
								_app.model.dispatch();
								}
							});
						_app.model.dispatch();
						}
					else{
						_app.model.enqueue({"_cmd":"appCartCreate"},function(data){
							_app.ext.anycommerce.u.updateCart(data._cartid, next);
							});
						_app.model.dispatch();
						}
					}
				else {
					next();
					}
				},
			u : {
				getDomain : function(){
					return config.domain;
					},
				getSecureUrl : function(){
					if(window.location.hostname == "localhost"){
						return "/";
						}
					else {
						return "https://"+config.secureDomain+"/";
						}
					},
				//These functions take messages (and errids) and transform them into various message types for anymessage
				successMsgObject : function(msg)	{
					return {'errid':'#','errmsg':msg,'message':msg,'errtype':'success','iconClass':'app-icon-success'}
					},
				errMsgObject : function(msg,errid)	{
					return {'errid':errid || '#','errmsg':msg,'errtype':'apperr','iconClass':'app-icon-error','containerClass':'ui-state-error'}
					},
				statusMsgObject : function(msg)	{
					return {'errid':'#','errmsg':msg,'errtype':'statusupdate','iconClass':'app-icon-warn','containerClass':'ui-state-statusupdate'}
					},
				youErrObject : function(errmsg,errid)	{
					return {'errid':errid || 0,'errmsg':errmsg,'errtype':'youerr','iconClass':'ui-icon-youerr','containerClass':'ui-state-highlight'}
					},
				globalmessage : function(msgObject){
					if(typeof msgObject == 'string'){
						msgObject = _app.ext.anycommerce.u.statusMsgObject(msgObject);
						}
					$(config.globalMessagingSelector).anymessage(msgObject);
					},
				responseHasErrors : function(responseData){
		//			_app.u.dump('BEGIN model.responseHasErrors');
		//at the time of this version, some requests don't have especially good warning/error in the response.
		//as response error handling is improved, this function may no longer be necessary.
					var r = false; //defaults to no errors found.
					if(responseData['_rtag'] && responseData['_rtag'].forceError)	{
						r = true;
						responseData.errid = "MVC-ERROR-000";
						responseData.errtype = "debug";
						responseData.errmsg = "forceError is true for _tag. cmd = "+responseData['_rcmd']+" and uuid = "+responseData['_uuid'];
		//			_app.u.dump(responseData);
						}
					else	{
						switch(responseData['_rcmd'])	{
							case 'appProductGet':
							case 'adminProductDetail':
			//the API doesn't recognize doing a query for a sku and it not existing as being an error. handle it that way tho.
								if(!responseData['%attribs'] || !responseData['%attribs']['db:id']) {
									r = true;
									responseData['errid'] = "MVC-M-100";
									responseData['errtype'] = "missing"; 
									responseData['errmsg'] = "could not find product "+responseData.pid+". Product may no longer exist. ";
									} //db:id will not be set if invalid sku was passed.
								break;
		//most of the time, a successful response w/out errors is taken as a success. however, due to the nature of appCartCreate, we verify we have what we need.
							case 'appCartCreate':
								if(!responseData._cartid)	{
									r = true;
									responseData['errid'] = "MVC-M-150";
									responseData['errtype'] = "apperr"; 
									responseData['errmsg'] = "appCartCreate response did not contain a _cartid.";
									}
								break;
							case 'adminEBAYProfileDetail':
								if(!responseData['%PROFILE'] || !responseData['%PROFILE'].PROFILE)	{
									r = true;
									responseData['errid'] = "MVC-M-300";
									responseData['errtype'] = "apperr"; 
									responseData['errmsg'] = "profile came back either without %PROFILE or without %PROFILE.PROFILE.";
									}
								break;
							case 'appNavcatDetail':
								if(responseData.errid > 0 || responseData['exists'] == 0)	{
									r = true
									responseData['errid'] = "MVC-M-200";
									responseData['errtype'] = "apperr";
									responseData['errmsg'] = "could not find category (may not exist)";
									} //a response errid of zero 'may' mean no errors.
								break;
			
							default:
								if(Number(responseData['errid']) > 0 && responseData.errtype != 'warn') {r = true;} //warnings do not constitute errors.
								else if(Number(responseData['_msgs']) > 0)	{
									var errorTypes = new Array("youerr","fileerr","apperr","apierr","iseerr","cfgerr");
									//the _msg format index starts at one, not zero.
									for(var i = 1, L = Number(responseData['_msgs']); i <= L; i += 1)	{
										if($.inArray(responseData['_msg_'+i+'_type'],errorTypes) >= 0)	{
											r = true;
											break; //once an error type is found, exit. one positive is enough.
											}
										}
									}
		// *** 201336 -> mostly impacts admin UI. @MSGS is another mechanism for alerts that needs to be checked.
								else if(responseData['@MSGS'] && responseData['@MSGS'].length)	{
									var L = responseData['@MSGS'].length;
									for(var i = 0; i < L; i += 1)	{
										if(responseData['@MSGS'][i]['!'] == 'ERROR')	{
											r = true;
											break; //if we have an error, exit early.
											}
										}
									}
								else if(responseData['@RESPONSES'] && responseData['@RESPONSES'].length)	{
									for(var i = 0, L = responseData['@RESPONSES'].length; i < L; i += 1)	{
										if(responseData['@RESPONSES'][i]['msgtype'] == 'ERROR' || responseData['@RESPONSES'][i]['msgtype'] == 'apierr')	{
											r = true;
											break; //if we have an error, exit early.
											}
										}
									}
								else {}
				//				_app.u.dump('default case for error handling');
								break;
							}
						}
		//			if(r)	{
		//				_app.u.dump(" -> responseData"); _app.u.dump(responseData);
		//				}
			//		_app.u.dump('//END responseHasErrors. has errors = '+r);
					return r;
					
					},
				buyerLogin : function(email, password, callback){
					console.log('buyerLogin');
					_app.model.enqueue({"_cmd":"cartSet","bill/email":email});
					_app.model.enqueue({
						"_cmd" : "appBuyerLogin",
						"login" : email,
						"password" : password,
						"method" : "unsecure"
						}, function(data){
							if(_app.ext.anycommerce.u.responseHasErrors(data)){
								_app.ext.anycommerce.u.globalmessage({'message':data});
								}
							else {
								_app.ext.anycommerce.u.globalmessage(_app.ext.anycommerce.u.successMsgObject("Thank you, you are now logged in."));
								_app.ext.anycommerce.u.updateCart(null, callback);
								}
							});
					_app.model.dispatch();
					},
				buyerLogout : function(callback){
					_app.model.enqueue({"_cmd":"cartSet","bill/email":false});
					_app.model.enqueue({"_cmd":"buyerLogout"})
					_app.ext.anycommerce.u.updateCart(null, callback);
					},
				updateCart : function(_cartid, callback){
					console.log('update cart');
					callback = callback || function(){};
					if(!_app.server()){
						if(_cartid != null){
							_app._cartid = _cartid;
							console.log(_cartid);
							window.localStorage.setItem('_cartid', _cartid);
							console.log(_cartid);
							_app.model.updateCartId(_cartid);
							}
						_app.model.enqueue({"_cmd":"cartItemsInventoryVerify"},function(data){
							
							for(var i in data['%changes']){
								_app.model.enqueue({
									'_cmd':'cartItemUpdate',
									'stid':i,
									'quantity' : data['%changes'][i]
									});
								}
							if(data['%changes'] && !$.isEmptyObject(data['%changes'])){
								// console.log('sending global message');
								_app.ext.anycommerce.u.globalmessage("Some items in your <a href='/cart'>cart</a> have had their quantities changed to reflect availability");
								_app.model.dispatch(function(){
									_app.model.enqueue({"_cmd":"cartDetail"}, function(cart){
										_app.cart = cart;
										_app.cart['%changes'] = data;
										callback(_app.cart);
										});
									_app.model.dispatch();
									});
								}
							else {
								_app.model.enqueue({"_cmd":"cartDetail"}, function(cart){
									_app.cart = cart;
									callback(_app.cart);
									});
								_app.model.dispatch();
								}
							});
						_app.model.dispatch();
						}
					else if(_cartid){
						//Probably will remove all server side cart handling
						callback = callback || function(){};
						_app.model.enqueue({"_cmd":"cartItemsInventoryVerify","_cartid":_cartid},function(){
							for(var i in data['%changes']){
								_app.model.enqueue({
									'_cmd':'cartItemUpdate',
									'stid':i,
									'qty' : data['%changes'][i]
									});
								}
							if(data['%changes'].length){
								_app.model.dispatch(function(){
									_app.model.enqueue({"_cmd":"cartDetail","_cartid":_cartid}, function(cart){
										var cart = cart;
										cart['%changes'] = data;
										callback(cart);
										});
									_app.model.dispatch();
									});
								}
							else {
								_app.model.enqueue({"_cmd":"cartDetail","_cartid":_cartid});
								}
							});
						_app.model.dispatch();
						}
					else {
						callback(null);
						}
					}
				}, // u
			tlc : {
				cartqtyupdate : function(context){
					var $tag = context.$focus();
					var stid = context.args('stid');
					var stidAttr = context.args('stidattr');
					if(!stid && stidAttr){
						stid = $tag.attr(stidAttr);
						}
					var qty = context.args('qty');
					var qtyAttr = context.args('qtyattr');
					if(!qty && qtyAttr){
						qty = $tag.prop(qtyAttr);
						}
					console.log('cartqtyupdate');
					console.log(stid);
					console.log(qty);
					if(stid && (qty || qty == 0)){
						var request = {
							"_cmd" : "cartItemUpdate",
							"stid" : stid,
							"quantity" : qty
							}
						_app.model.enqueue(request);
						_app.ext.anycommerce.u.updateCart(null, function(){
							console.log('cart updated');
							_app.ext.pager.u.refresh('/cart');
							});
						return true;
						}
					else {
						return false;
						}
					},
				cartitemappend : function(context){
					var $form = context.$focus();
					var formJson = $form.serializeForm();
					
					//TODO validate required variations
					
					var request = {
						"_cmd" : "cartItemAppend",
						"qty" : formJson.qty,
						"sku" : formJson.pid,
						"uuid" : new Date().getTime()
						}
					_app.model.enqueue(request, function(data){
						_app.ext.anycommerce.u.globalmessage(_app.ext.anycommerce.u.successMsgObject('Your item has been added to your <a href="/cart">cart</a>!'));
						console.log(data);
						});
					_app.ext.anycommerce.u.updateCart(null, function(cart){
						
						});
					return true;
					
					},
				imageurl : function(context){
					var url = config.mediaUrl;
					var w = context.args('w');
					var h = context.args('h');
					var b = context.args('b');
					if(context.$focus().is('img')){
						if(!w && context.$focus().attr('data-width')){
							w = context.$focus().attr('data-width');
							}
						if(!h && context.$focus().attr('data-height')){
							h = context.$focus().attr('data-height');
							}
						}
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
					},
				validateform : function(context){
					var r = context.$focus().validateForm();
					console.log('form valid: '+r);
					return r;
					},
				submitlogin : function(context){
					var formJson = context.$focus().serializeForm();
					console.log(formJson);
					_app.ext.anycommerce.u.buyerLogin(formJson.login, formJson.password, function(){
						if(context.args('redirect')){
							_app.navigate(context.args('redirect'));
							}
						else if(formJson.redirect){
							console.log('REDIRECTING '+formJson.redirect);
							_app.navigate(formJson.redirect);
							}
						else {
							//whatever dude
							}
						});
					return true;
					}
				}, // tlc
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
					},
				handleCommonPlugins : function(req,res,next){
					var $context = res.$view;
					$('.applyAnycb',$context).anycb();
					$('.applyAnytable',$context).anytable();
					$('.toolTip',$context).tooltip();
					$('.applyAnytabs',$context).anytabs();
					//will set the title attribute to the placeholder value (if title not already set). useful for places w/ no label and content populated (covering the placeholder value).
					$(":input[placeholder]",$context).not(['title']).each(function(){
						$(this).attr('title',$(this).attr('placeholder'));
						});
					$('.applyButtonset',$context).each(function(){
						$(this).buttonset();
						});
					$('.applyButton',$context).each(function(index){
//					_app.u.dump(" -> index: "+index);
						var $btn = $(this);
						$btn.button();
// SANITY -> $btn may NOT be on the DOM when this is run.
						if($btn.data('icon-primary') && $btn.data('icon-secondary'))	{
							$btn.button( "option", "icons", { primary: $btn.data('icon-primary'), secondary: $btn.data('icon-secondary')} );
							}
						else if($btn.data('icon-primary'))	{
							$btn.button( "option", "icons", { primary: $btn.data('icon-primary')} );
							}
						else if($btn.data('icon-secondary'))	{
							$btn.button( "option", "icons", { secondary: $btn.data('icon-secondary')} );
							}
						else	{} //no icon specified.
						
						if($btn.data('text') === false)	{
							$btn.button( "option", "text", false );
							}
						});
					next();
					},
				buyerAddressList : function(req,res,next){
					_app.model.enqueue({
						"_cmd" : "buyerAddressList"
						}, function(data){
							// console.log('buyerAddressList');
							// console.log(data);
							res.data.buyer = res.data.buyer || {};
							res.data.buyer['@bill'] = data['@bill'];
							res.data.buyer['@ship'] = data['@ship'];
							next();
							});
					_app.model.dispatch();
					},
				buyerPurchaseHistory : function(req,res,next){
					_app.model.enqueue({
						"_cmd" : "buyerPurchaseHistory"
						}, function(data){
							console.log(data);
							next();
							});
					_app.model.dispatch();
					},
				buyerProductLists : function(req,res,next){
					_app.model.enqueue({
						"_cmd" : "buyerProductLists"
						}, function(data){
							// console.log(data);
							next();
							});
					_app.model.dispatch();
					},
				appCheckoutDestinations : function(req,res,next){
					_app.model.enqueue({"_cmd" : "appCheckoutDestinations"}, function(data){
						// console.log(data);
						res.data['@destinations'] = data['@destinations'];
						next();
						});
					_app.model.dispatch();
					},
				appPaymentMethods : function(req,res,next){
					_app.model.enqueue({"_cmd":"appPaymentMethods"},function(data){
						// console.log(data);
						res.data['@paymethods'] = data['@methods'];
						next();
						});
					_app.model.dispatch();
					}
				}, // middleware
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
							if(n.charAt(0) != '.'){
								n = '.'+n;
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
								console.log(req.params);
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
								"query":{"query_string":{"query":k}}
								// "query":{
									// "function_score" : {										
										// "query" : {
											// "query_string":{"query":k}	
											// },
										// "functions" : [
											// {
												// "filter" : {"query" : {"query_string":{"query":'"'+k+'"'}}},
												// "script_score" : {
													// "script":"constant",
													// "params":{"constant":10}
													// },
												// }
											// ],
										// "boost_mode" : "sum",
										// }
									// }
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
				} // middlewareBuilders
			} // r
		if(!config.domain || !config.mediaUrl){
			//throw an exception
			}
		var apiClient = root.apiClient || require('./api-client');
		var apiurl = _app.server() ? "http://" : "//";
		apiurl += config.domain+"/jsonapi/"
		_app.model = new apiClient({
			domain : config.domain,
			apiurl : apiurl
			});
			
		
		var mwcache = {};
		if(!_app.server()){
			$.fn.serializeForm = function(options){
				var json = {}
				var $form = $(this);
				options = options || {}
				options.cb = options.cb || false;
				//allows for a different selector to be passed, such as :input.edited
				options.selector = options.selector || ":input";

				$(options.selector,$form).each(function(){
					var val;
			//		dump(" -> this.type: "+this.type);
					if(!this.name){return}; //early exit if name not set, which is required.

					if ('radio' === this.type) {
						if(json[this.name]) { return; } //value already set, exit early.
						json[this.name] = this.checked ? this.value : '';
						}
					else if('select-multiple' === this.type)	{
						if(!this.value)	{}
						else	{
			//multiple select is saved as an array.  If you need it flattened, either write a param to change the behavior or flatten it outside.
							var optionsArr = new Array(); // 'this' loses meaning in the option loop, so a var is created and set after.
							$('option',$(this)).each(function(){
								var $option = $(this);
				//				dump(" -> $option.prop('selected'): "+$option.prop('selected'));
								if($option.prop('selected'))	{
									optionsArr.push($option.val());
									}
								})
							json[this.name] = optionsArr;
							}
						}
					else if ('checkbox' === this.type) {
						if(options.cb)	{
							if (this.checked) {json[this.name] = '1';}
							else {json[this.name] = '0';}
							}
						else	{
							if (this.checked) {json[this.name] = 'on';} //must be lowercase. that's the html default and what the old cgi's are looking for.
							}
			//			else	{json[this.name] = 0;}
						}
					else {
						json[this.name] = this.value;
						}
					})
				return json;
				}
			
			var formatRules = {
				'CC' : function($input,$err)	{
					// console.log('validating CC number');
					var ccNumb = $input.val();
					var valid = "0123456789"  // Valid digits in a credit card number
					var len = ccNumb.length;  // The length of the submitted cc number
					var iCCN = parseInt(ccNumb);  // integer of ccNumb
					var sCCN = ccNumb.toString();  // string of ccNumb
					sCCN = sCCN.replace (/^\s+|\s+$/g,'');  // strip spaces
					var iTotal = 0;  // integer total set at zero
					var bNum = true;  // by default assume it is a number
					var bResult = false;  // by default assume it is NOT a valid cc
					var temp;  // temp variable for parsing string
					var calc;  // used for calculation of each digit
					// console.log('variables declared');
					// Determine if the ccNumb is in fact all numbers
					for (var j=0; j<len; j++) {
						temp = "" + sCCN.substring(j, j+1);
						if (valid.indexOf(temp) == "-1"){bNum = false;}
						}
				
					// if it is NOT a number, you can either alert to the fact, or just pass a failure
					if(!bNum){
						/*alert("Not a Number");*/bResult = false;
						}
				
					// console.log('starting length calculations');
				// Determine if it is the proper length 
					if((len == 0)&&(bResult)){  // nothing, field is blank AND passed above # check
						bResult = false;
						}
					else	{  // ccNumb is a number and the proper length - let's see if it is a valid card number
						if(len >= 15){  // 15 or 16 for Amex or V/MC
							for(var i=len;i>0;i--){  // LOOP throught the digits of the card
								calc = parseInt(iCCN) % 10;  // right most digit
								calc = parseInt(calc);  // assure it is an integer
								iTotal += calc;  // running total of the card number as we loop - Do Nothing to first digit
								i--;  // decrement the count - move to the next digit in the card
								iCCN = iCCN / 10;                               // subtracts right most digit from ccNumb
								calc = parseInt(iCCN) % 10 ;    // NEXT right most digit
								calc = calc *2;                                 // multiply the digit by two
				// Instead of some screwy method of converting 16 to a string and then parsing 1 and 6 and then adding them to make 7,
				// I use a simple switch statement to change the value of calc2 to 7 if 16 is the multiple.
								switch(calc){
									case 10: calc = 1; break;       //5*2=10 & 1+0 = 1
									case 12: calc = 3; break;       //6*2=12 & 1+2 = 3
									case 14: calc = 5; break;       //7*2=14 & 1+4 = 5
									case 16: calc = 7; break;       //8*2=16 & 1+6 = 7
									case 18: calc = 9; break;       //9*2=18 & 1+8 = 9
									default: calc = calc;           //4*2= 8 &   8 = 8  -same for all lower numbers
									}                                               
								iCCN = iCCN / 10;  // subtracts right most digit from ccNum
								iTotal += calc;  // running total of the card number as we loop
								}  // END OF LOOP
							if ((iTotal%10)==0){  // check to see if the sum Mod 10 is zero
								bResult = true;  // This IS (or could be) a valid credit card number.
								}
							else {
								bResult = false;  // This could NOT be a valid credit card number
								}
							}
						}
					// console.log('we finished');
					// console.log(bResult);
					// var r = _app.u.isValidCC($input.val());
					if(!bResult)	{$err.append('The credit card # provided is not valid')}
					return bResult;
					},
				
				'CV' : function($input,$err)	{
					var r = false;
					if(isNaN($input.val())){$err.append('The CVV/CID must be a #');}
					else if($input.val().length <= 2)	{$err.append('The CVV/CID # must be at least three digits');}
					else	{r = true;}
					return r;
					}
				}
				
			$.fn.validateForm = function(options){
				var $form = $(this);
				console.log("BEGIN $.validateForm");
				if($form && $form instanceof jQuery)	{

					
					var r = true; //what is returned. false if any required fields are empty.
					var radios = {};  //an object used to store whether or not radios are required and, if so, whether one is selected.
					// $form.showLoading({'message':'Validating'});

					$('.formValidationError',$form).empty().remove(); //clear all previous error messaging
					var radios = {} //stores a list of which radio inputs are required.
					$(':input',$form).each(function(){
						var
							$input = $(this),
							$span = $("<span \/>").css('padding-left','6px').addClass('formValidationError'),
							required = ($input.attr('required') == 'required') ? true : false;
						
						$input.removeClass('ui-state-error'); //remove previous error class
					
						function removeClass($t){
							$t.off('focus.removeClass').on('focus.removeClass',function(){$t.removeClass('ui-state-error')});
							}

	//					_app.u.dump(" -> "+$input.attr('name')+" - required: "+$input.attr('required'));
						if($input.is(':hidden') && $input.data('validation-rules') && $input.data('validation-rules').indexOf('skipIfHidden') >= 0)	{
							dump(" -> skipIfHidden is enabled");
							//allows for a form to allow hidden fields that are only validated if they're displayed. ex: support fieldset for topic based questions.
							//indexOf instead of == means validation-rules (notice the plural) can be a space seperated list
							}
						else if($input.prop('disabled')){} //do not validate disabled fields. if required and blank and disabled, form would never submit.
						else if($input.prop('type') == 'radio'){
	//keep a list of all required radios. only one entry per name.
	//_app.u.dump(" -> $input.attr('name'): "+$input.attr('name')+' and required: '+$input.attr('required'));

							if(required)	{
								radios[$input.attr('name')] = 1
								}
							}
						else if($input.attr('data-format-rules') && (required || $input.val()))	{
							var rules = $input.attr('data-format-rules').split(' ');
							// if(_app.u.processFormatRules(rules,$input,$span))	{}
							// else	{
							if(typeof rules == 'object' && $input instanceof jQuery)	{
								var L = rules.length;
								for(var i = 0; i < L; i += 1)	{
									console.log(i+") is for rule: "+rules[i]+" and typeof formatRules: "+typeof formatRules[rules[i]]);
									if(typeof formatRules[rules[i]] == 'function')	{
										if(formatRules[rules[i]]($input,$span))	{
											console.log("passed rule validation")
											}
										else	{
											console.log('failed validation');
											r = false;
											$input.addClass('ui-state-error');
											$input.after($span);
											}
										}
									else	{
										console.warn("A formatting rule ["+rules[i]+"] that does not exist was specified on an input: "+$input.attr('name'));
										}
									}
								}
							else	{
								$('#globalMessaging').anymessage({"message":"In contoller.u.processFormatRules, either rules is not an array ["+(typeof rules)+"] or $input is not a valid jquery instance ["+($input instanceof jQuery)+"].","gMessage":true});
								}
							
							}
	//only validate the field if it's populated. if it's required and empty, it'll get caught by the required check later.
						else if($input.attr('type') == 'url' && $input.val())	{
							var urlregex = new RegExp("^(http:\/\/|ssh:\/\/|https:\/\/|ftp:\/\/){1}([0-9A-Za-z]+\.)");
							if (urlregex.test($input.val())) {}
							else	{
								r = false;
								$input.addClass('ui-state-error');
								$input.after($span.text('not a valid url. '));
								$("<span class='toolTip' title='A url must be formatted as http, https, ssh or ftp ://www.something.com/net/org/etc'>?<\/span>").tooltip().appendTo($span);
								}
							}

						else if($input.attr('type') == 'number' && $input.val())	{
	//						_app.u.dump(" -> number validation. value: "+$input.val()+" and isNaN: "+isNaN($input.val()));
							if (!isNaN($input.val())) {
								if($input.attr('min') && (Number($input.val()) < Number($input.attr('min'))))	{
									r = false;
									$input.addClass('ui-state-error');
									$input.after($span.text('minimum value of '+$input.attr('min')+'. '));
									}
								else if($input.attr('max') && (Number($input.val()) > Number($input.attr('max'))))	{
									r = false;
									$input.addClass('ui-state-error');
									$input.after($span.text('max value of '+$input.attr('max')+'. '));
									}
								else	{
	//								_app.u.dump(" -> everything appears to check out w/  "+$input.attr('name')+" number input.");
									}
								}
							else	{
								// _app.u.dump(" -> value is not a number");
								r = false;
								$input.addClass('ui-state-error');
								$input.after($span.text('not a number. '));
								}
							}

						else if ($input.attr('type') == 'email' && !/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test($input.val()))	{
							//only 'error' if field is required. otherwise, show warning
							if(required)	{
								r = false;
								$input.addClass('ui-state-error');
								}
							else if($input.val())	{
								$input.after($span.text('not a valid email address'));
								removeClass($input);
								}
							else	{} //field is not required and blank.
							}
	//technically, maxlength isn't a supported attribute for a textarea. data-maxlength is used instead.
						else if(($input.attr('maxlength') && $input.val().length > $input.attr('maxlength')) || ($input.attr('data-maxlength') && $input.val().length > $input.attr('data-maxlength')))	{
							r = false;
							$input.addClass('ui-state-error');
							$input.after($span.text('allows a max of '+($input.attr('maxlength') || $input.attr('data-maxlength'))+' characters'));
							removeClass($input);
							}
						else if($input.data('minlength') && $input.val().length < $input.data('minlength'))	{
							r = false;
							$input.addClass('ui-state-error');
							$input.after($span.text('requires a minimum of '+$input.data('minlength')+' characters'));
							removeClass($input);
							}
	//Support for 'min' attr which is the minimum numerical value (ex: 0 or 7) for the input value.
	//number input type has a native min for minimum value
						else if($input.attr('min') && Number($input.val()) < Number($input.attr('min')))	{
							r = false;
							$input.addClass('ui-state-error');
							$input.after($span.text('requires a minimum value of '+$input.attr('min')));
							removeClass($input);
							}
	//Support 'max' attr which is the maximum numerical value (ex: 0 or 7) for the input value.
	//number input type has a native max for max value
						else if($input.attr('max') && Number($input.val()) > Number($input.attr('max')))	{
							r = false;
							$input.addClass('ui-state-error');
							$input.after($span.text('requires a maximum value of '+$input.attr('max')));
							removeClass($input);
							}
	//Checking required is last so that the more specific error messages would be displayed earlier
						else if(required && !$input.val())	{
							r = false;
							$input.addClass('ui-state-error');
							$input.after($span.text('required'));
							removeClass($input);
							}
						else	{
							
							}

						
						if($input.hasClass('ui-state-error'))	{
							console.log(" -> "+$input.attr('name')+" did not validate. ishidden: "+$input.is(':hidden'));
							}
						
						});


	//_app.u.dump(" -> radios:"); _app.u.dump(radios);
					if(!$.isEmptyObject(radios))	{
	//					_app.u.dump(" -> radios is not empty");
						var L = radios.length;
						for(var index in radios)	{
							if($("input:radio[name='"+index+"']:checked",$form).val())	{
	//							_app.u.dump(" -> radio name='"+index+"' has a value selected");
								} //is selected.
							else	{
								var message = "<div class='formValidationError clearfix marginTop marginBottom ui-state-error smallPadding ui-corner-all'>Please select one choice from the list below:<\/div>"
								if($("input:radio[name='"+index+"']:first",$form).closest("[data-app-role='radioContainer']").length)	{
									$("input:radio[name='"+index+"']:first",$form).closest("[data-app-role='radioContainer']").prepend(message)
									}
								else	{
									$("input:radio[name='"+index+"']",$form).first().closest('fieldset').prepend(message)
									}
								}
							}
						//check to see if the required radios have a value set. this list only contains radio input names that are required.
						//if none are selected. add ui-state-error to each radio input of that name.
						}
					// $form.hideLoading();
					}
				else	{
					$('#globalMessaging').anymessage({'message':'Object passed into admin.u.validateForm is empty or not a jquery object','gMessage':true});
					}
				console.log(" -> r in validateForm: "+r);
				return r;
				
				}
			}
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