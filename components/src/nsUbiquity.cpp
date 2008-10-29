#include "nsIGenericFactory.h"
#include "nsUbiquity.h"

#include "jsapi.h"
#include "nsIXPConnect.h"
#include "nsAXPCNativeCallContext.h"
#include "nsServiceManagerUtils.h"
#include "nsUbiquity_private.h"

NS_IMPL_ISUPPORTS1(nsUbiquity, nsIUbiquity)

nsUbiquity::nsUbiquity()
{
  /* member initializers and constructor code */
}

nsUbiquity::~nsUbiquity()
{
  /* destructor code */
}

/* long add (in long a, in long b); */
NS_IMETHODIMP nsUbiquity::Add(PRInt32 a, PRInt32 b, PRInt32 *_retval)
{
    *_retval = a + b + 1;
    return NS_OK;
}

/* void throwArg (); */
NS_IMETHODIMP
nsUbiquity::ThrowArg(void)
{
    // This implementation was copied from
    // js/src/xpconnect/tests/components/xpctest_echo.cpp in
    // mozilla-central.

    nsresult rv;
    nsAXPCNativeCallContext *cc = nsnull;
    nsCOMPtr<nsIXPConnect> xpc(do_GetService(nsIXPConnect::GetCID(), &rv));

    if(NS_SUCCEEDED(rv))
      rv = xpc->GetCurrentNativeCallContext(&cc);

    if(NS_FAILED(rv) || !cc)
        return NS_ERROR_FAILURE;

    //nsCOMPtr<nsISupports> callee;
    //if(NS_FAILED(cc->GetCallee(getter_AddRefs(callee))) || 
    //   callee != static_cast<nsIEcho*>(this))
    //    return NS_ERROR_FAILURE;

    PRUint32 argc;
    if(NS_FAILED(cc->GetArgc(&argc)) || !argc)
        return NS_OK;

    jsval* argv;
    JSContext* cx;
    if(NS_FAILED(cc->GetArgvPtr(&argv)) ||
       NS_FAILED(cc->GetJSContext(&cx)))
        return NS_ERROR_FAILURE;

    JS_SetPendingException(cx, argv[0]);
    return NS_OK;
}

nsresult
xpc_EvalInSandbox(JSContext *cx, JSObject *sandbox, const nsAString& source,
                  const char *filename, PRInt32 lineNo,
                  PRBool returnStringOnly, jsval *rval)
{
    // Implementation taken from js/src/xpconnect/src/xpccomponents.cpp
    // in mozilla-central and modified.

    // TODO: Figure out a way of doing this even though we don't
    // necessarily have access to the SandboxClass.
    //if (STOBJ_GET_CLASS(sandbox) != &SandboxClass)
    //  return NS_ERROR_INVALID_ARG;

    nsIScriptObjectPrincipal *sop =
        (nsIScriptObjectPrincipal*)xpc_GetJSPrivate(sandbox);
    NS_ASSERTION(sop, "Invalid sandbox passed");
    nsCOMPtr<nsIPrincipal> prin = sop->GetPrincipal();

    JSPrincipals *jsPrincipals;

    if (!prin ||
        NS_FAILED(prin->GetJSPrincipals(cx, &jsPrincipals)) ||
        !jsPrincipals) {
        return NS_ERROR_FAILURE;
    }

    nsRefPtr<ContextHolder> sandcx = new ContextHolder(cx, sandbox);
    if(!sandcx || !sandcx->GetJSContext()) {
        JS_ReportError(cx, "Can't prepare context for evalInSandbox");
        JSPRINCIPALS_DROP(cx, jsPrincipals);
        return NS_ERROR_OUT_OF_MEMORY;
    }

    JS_SetVersion(sandcx->GetJSContext(), JSVERSION_1_8);

    nsresult rv = NS_OK;

    nsCOMPtr<nsIJSContextStack> stack = do_GetService("@mozilla.org/js/xpc/ContextStack;1", &rv);

    if (NS_FAILED(rv)) {
      JSPRINCIPALS_DROP(cx, jsPrincipals);
      return rv;
    }

    if (NS_FAILED(stack->Push(sandcx->GetJSContext()))) {
      JS_ReportError(cx,
                     "Unable to initialize XPConnect with the sandbox context");
      JSPRINCIPALS_DROP(cx, jsPrincipals);
      return NS_ERROR_FAILURE;
    }

    rv = NS_OK;

    AutoJSRequestWithNoCallContext req(sandcx->GetJSContext());
    JSString *str = nsnull;
    if (!JS_EvaluateUCScriptForPrincipals(sandcx->GetJSContext(), sandbox,
                                          jsPrincipals,
                                          reinterpret_cast<const jschar *>
                                                          (PromiseFlatString(source).get()),
                                          source.Length(), filename, lineNo,
                                          rval) ||
        (returnStringOnly &&
         !JSVAL_IS_VOID(*rval) &&
         !(str = JS_ValueToString(sandcx->GetJSContext(), *rval)))) {
        jsval exn;
        if (JS_GetPendingException(sandcx->GetJSContext(), &exn)) {
            // Stash the exception in |cx| so we can execute code on
            // sandcx without a pending exception.
            {
                AutoJSSuspendRequestWithNoCallContext sus(sandcx->GetJSContext());
                AutoJSRequestWithNoCallContext cxreq(cx);

                JS_SetPendingException(cx, exn);
            }

            JS_ClearPendingException(sandcx->GetJSContext());
            if (returnStringOnly) {
                // The caller asked for strings only, convert the
                // exception into a string.
                str = JS_ValueToString(sandcx->GetJSContext(), exn);

                AutoJSSuspendRequestWithNoCallContext sus(sandcx->GetJSContext());
                AutoJSRequestWithNoCallContext cxreq(cx);
                if (str) {
                    // We converted the exception to a string. Use that
                    // as the value exception.
                    JS_SetPendingException(cx, STRING_TO_JSVAL(str));
                } else {
                    JS_ClearPendingException(cx);
                    rv = NS_ERROR_FAILURE;
                }
            }

            // Clear str so we don't confuse callers.
            str = nsnull;
        } else {
            rv = NS_ERROR_OUT_OF_MEMORY;
        }
    }

    if (str) {
        *rval = STRING_TO_JSVAL(str);
    }

    if (stack) {
        stack->Pop(nsnull);
    }

    JSPRINCIPALS_DROP(cx, jsPrincipals);

    return rv;
}

NS_IMETHODIMP nsUbiquity::EvalInSandbox(const nsAString &source,
                                        const char *filename,
                                        PRInt32 lineNo)
{
    // Implementation taken from js/src/xpconnect/src/xpccomponents.cpp
    // in mozilla-central and modified.

    nsresult rv;

    nsCOMPtr<nsIXPConnect> xpc(do_GetService(nsIXPConnect::GetCID(), &rv));
    if(NS_FAILED(rv))
        return rv;

    // get the xpconnect native call context
    nsAXPCNativeCallContext *cc = nsnull;
    xpc->GetCurrentNativeCallContext(&cc);
    if(!cc)
        return NS_ERROR_FAILURE;

    // Get JSContext of current call
    JSContext* cx;
    rv = cc->GetJSContext(&cx);
    if(NS_FAILED(rv) || !cx)
        return NS_ERROR_FAILURE;

    // get place for return value
    jsval *rval = nsnull;
    rv = cc->GetRetValPtr(&rval);
    if(NS_FAILED(rv) || !rval)
        return NS_ERROR_FAILURE;

    // get argc and argv and verify arg count
    PRUint32 argc;
    rv = cc->GetArgc(&argc);
    if(NS_FAILED(rv))
        return rv;

    if (argc < 4)
        return NS_ERROR_XPC_NOT_ENOUGH_ARGS;

    // The second argument is the sandbox object. It is required.
    jsval *argv;
    rv = cc->GetArgvPtr(&argv);
    if (NS_FAILED(rv))
        return rv;
    if (JSVAL_IS_PRIMITIVE(argv[3]))
        return NS_ERROR_INVALID_ARG;
    JSObject *sandbox = JSVAL_TO_OBJECT(argv[3]);

    rv = xpc_EvalInSandbox(cx, sandbox, source, filename, lineNo,
                           PR_FALSE, rval);

    if (NS_SUCCEEDED(rv) && !JS_IsExceptionPending(cx))
        cc->SetReturnValueWasSet(PR_TRUE);

    return rv;
}

NS_GENERIC_FACTORY_CONSTRUCTOR(nsUbiquity)

static nsModuleComponentInfo components[] =
{
    {
        NSUBIQUITY_CLASSNAME,
        NSUBIQUITY_CID,
        NSUBIQUITY_CONTRACTID,
        nsUbiquityConstructor,
    }
};

NS_IMPL_NSGETMODULE("nsUbiquityModule", components)
