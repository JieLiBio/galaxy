/**
 * Internal function to remove content from the main area and add the notebook.
 * Not idempotent
 */
function append_notebook(url){
    clear_main_area();
    $('#main').append('<iframe frameBorder="0" seamless="seamless" style="width: 100%; height: 100%; overflow:hidden;" scrolling="no" src="'+ url +'"></iframe>'
    );
}

function clear_main_area(){
    $('#spinner').remove();
    $('#main').children().remove();
}

function display_spinner(){
        $('#main').append('<img id="spinner" src="' + galaxy_root + 'static/style/largespinner.gif" style="position:absolute;margin:auto;top:0;left:0;right:0;bottom:0;">');
}


/* Create a spin_state object used by spin() and spin_again() */
function make_spin_state(type, ajax_timeout_init, ajax_timeout_max, ajax_timeout_step, sleep_init, sleep_max, sleep_step, log_attempts){
    var s = {};
    s.type = (typeof type !== 'undefined') ? type : "GIE spin";
    s.ajax_timeout = (typeof ajax_timeout_init !== 'undefined') ? ajax_timeout_init : 2000;
    s.ajax_timeout_max = (typeof ajax_timeout_max !== 'undefined') ? ajax_timeout_max : 10000;
    s.ajax_timeout_step = (typeof ajax_timeout_step !== 'undefined') ? ajax_timeout_step : 500;
    s.sleep = (typeof sleep_init !== 'undefined') ? sleep_init : 500;
    s.sleep_max = (typeof sleep_max !== 'undefined') ? sleep_max : 8000;
    s.sleep_step = (typeof sleep_step !== 'undefined') ? sleep_step : 100;
    s.log_attempts = (typeof log_attempts !== 'undefined') ? log_attempts : true;
    s.count = 0;
    return s;
}


/* FIXME: Maybe don't need this anymore */
function make_error_callback(console_msg, user_msg, clear){
    var f = function() {
        console.log(console_msg);
        if(clear) clear_main_area();
        if(typeof user_msg == "string"){
            toastr.clear();
            toastr.error(
                user_msg,
                "Error",
                {'closeButton': true, 'timeOut': 0, 'extendedTimeout': 0, 'tapToDismiss': false}
            );
        }
    }
    return f;
}

/* Increase sleep time and spin again. */
function spin_again(spin_state){
    if(spin_state.sleep < spin_state.sleep_max){
        spin_state.sleep += spin_state.sleep_step;
    }
    if(spin_state.log_attempts){
        console.log(spin_state.type + " request " + spin_state.count + " request timeout " + spin_state.ajax_timeout + "ms sleeping " + spin_state.sleep / 1000 + "s");
    }
    window.setTimeout(spin_state.spinner, spin_state.sleep);
}


/*
 * Spin on a URL as long as it times out, otherwise, call the provided success or error callback and stop spinning.
 *
 * NOTE: the caller needs to call spin_again(spin_state) in the success callback if so desired, or else the spinner terminates.
 *
 * Could pass in a flag saying whether it should be done for us by spin(), but only keep_alive() would use that.
 */
function spin(url, bool_response, success_callback, timeout_callback, error_callback, spin_state){
    var spinner = function(){
        var ajax_params = {
            url: url,
            xhrFields: {
                withCredentials: true
            },
            type: "GET",
            timeout: spin_state.ajax_timeout,
            success: success_callback,
            error: function(jqxhr, status, error){
                if(status == "timeout"){
                    if(spin_state.ajax_timeout < spin_state.ajax_timeout_max){
                        spin_state.ajax_timeout += spin_state.ajax_timeout_step;
                    }
                    spin_state.count++;
                    timeout_callback();
                    spin_again(spin_state);
                }else{
                    error_callback();
                }
            },
        }
        if(bool_response) ajax_params["dataType"] = "json";
        $.ajax(ajax_params);
    }
    console.log("Setting up new spinner for " + spin_state.type + " on " + url);
    spin_state.spinner = spinner;
    window.setTimeout(spinner, spin_state.sleep);
}


/*
 * Spin on a URL forever until there is an acceptable response. 
 * @param {String} url: URL to test response of. Must return a 200 (302->200 is OK).
 * @param {Boolean} bool_response: If set to `true`, do not stop spinning until the response is `true`. Otherwise, stop
 *     as soon as a successful response is received.
 */
function spin_until(url, bool_response, messages, success_callback, spin_state){
    var message_once = function(message, spin_state) {
        if(spin_state.count == 1){
            display_spinner();
            toastr.info(
                message,
                {'closeButton': true, 'timeOut': 0, 'extendedTimeout': 0, 'tapToDismiss': false}
            );
        }
    }
    var wrapped_success = function(data){
        if(!bool_response || (bool_response && data == true)){
            console.log(messages["success"]);
            clear_main_area();
            toastr.clear();
            success_callback();
        }else if(bool_response && data == false){
            message_once(messages["not_ready"], spin_state);
            spin_again(spin_state);
        }else{
            make_error_callback("Invalid response to " + spin_state.type + " request", messages["invalid_response"], true)();
        }
    }
    spin(
        url,
        bool_response,
        wrapped_success,
        function(){
            message_once(messages["timeout"], spin_state);
        },
        // FIXME: turns out with the ready/available functions we want to
        // ignore 502s as well (but maybe if we get enough of them we should
        // eventually time out)?
        function(){
            spin_state.count++;
            message_once(messages["timeout"], spin_state);
            spin_again(spin_state);
        },
        spin_state
    );
}


/**
 * Test a boolean (json) response from a URL, and call a callback when done.
 * http://stackoverflow.com/q/25390206/347368
 * @param {String} url: URL to test response of. Must return a 200 (302->200 is OK) and either `true` or `false`.
 * @param {String} callback: function to call once successfully connected.
 *
 */
function load_when_ready(url, success_callback){
    var messages = {
        success: "Galaxy reports IE container ready, returning",
        not_ready: "Galaxy is launching a container in which to run this interactive environment. Please wait...",
        unknown_response: "Galaxy failed to launch a container in which to run this interactive environment, contact your administrator.",
        timeout: "Galaxy is launching a container in which to run this interactive environment. Please wait...",
        error: "Galaxy encountered an error while attempting to determine the readiness of this interactive environment's container, contact your administrator."
    }
    var spin_state = make_spin_state("IE container readiness");
    spin_until(url, true, messages, success_callback, spin_state);
}


/**
 * Test availability of a URL, and call a callback when done.
 * http://stackoverflow.com/q/25390206/347368
 * @param {String} url: URL to test availability of. Must return a 200 (302->200 is OK).
 * @param {String} callback: function to call once successfully connected.
 *
 */
function test_ie_availability(url, success_callback){
    var messages = {
        success: "IE connection succeeded, returning",
        timeout: "Attempting to connect to the interactive environment. Please wait...",
        error: "An error was encountered while attempting to connect to the interactive environment, contact your administrator."
    }
    var spin_state = make_spin_state("IE availability");
    spin_until(url, false, messages, success_callback, spin_state);
}
