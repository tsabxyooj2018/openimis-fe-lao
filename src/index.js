import "react-app-polyfill/ie11";
import "react-app-polyfill/stable";
import * as Sentry from "@sentry/react";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { MuiThemeProvider, LinearProgress } from "@material-ui/core";
import { Provider } from "react-redux";
import MomentUtils from "@date-io/moment";
import { MuiPickersUtilsProvider } from "@material-ui/pickers";
import * as serviceWorker from "./serviceWorker";
import createAppTheme from "./helpers/theme";
import { defaultColors, publishCssVariables } from "./helpers/palette";
import store from "./helpers/store";
import LocalesManager from "./LocalesManager";
import ModulesManager from "./ModulesManager";
import ModulesManagerProvider from "./ModulesManagerProvider";
import { App, FatalError, baseApiUrl, apiHeaders } from "@openimis/fe-core";
import getConfiguredLogo from "./helpers/logo";
import messages_ref from "./translations/ref.json";
import "./index.css";
import "./rc-cascader.css";

// Served by the avatar sidecar; absent until an administrator uploads one.
// Declared after the imports, not among them: Create React App treats
// import/first as an error when CI is set, as it is in Actions.
const BRANDING_LOGO = "/avatars/branding/logo";

Sentry.init({ 
  dsn: process.env.REACT_APP_SENTRY_DSN,
  debug: false,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: 1.0,
});

const loadConfiguration = async () => {
  const response = await fetch(`${baseApiUrl}/graphql`, {
    method: "post",
    headers: apiHeaders(),
    body: JSON.stringify({ "query": "{ moduleConfigurations { module, config, controls{ field, usage } } }" }),
  });
  if (!response.ok) {
    Sentry.captureException(new Error(`${response.status} ${response.statusText}`));
    throw response;
  } else {
    const { data } = await response.json();
    data.moduleConfigurations.unshift({});
    const out = data.moduleConfigurations.reduce((acc, c) => {
      try {
        acc[c.module] = { controls: c.controls, ...JSON.parse(c.config) };
      } catch (error) {
        console.error(`Failed to parse module ${c.module} config`, error);
      }
      return acc;
    });
    return out;
  }
};

const AppContainer = () => {
  const [appState, setAppState] = React.useState({ isLoading: true, config: undefined, error: null });
  const localesManager = new LocalesManager();

  useEffect(() => {
    loadConfiguration().then(
      (config) => {
        setAppState({
          error: null,
          isLoading: false,
          config,
        });
      },
      (error) => {
        Sentry.captureException(new Error("Failed to load configuration"));
        setAppState({
          error,
          isLoading: false,
        });
      }
    );
  }, []);  

  const themeColor = appState?.config?.["fe-core"]?.theme;
  const dynamicTheme = createAppTheme(themeColor || {});

  /*
   * Hand the resolved palette to CSS.
   *
   * The stylesheets and the three modules that build their own DOM all read
   * var(--brand). Publishing it from the theme that is actually in force -- not
   * from the defaults -- means a fe-core.theme override in the database recolours
   * them too, rather than recolouring only the Material-UI half and leaving the
   * login page and the sidebar gradients on the built-in value.
   *
   * Every var() carries a fallback, so the page is correct in the moment before
   * this runs and correct still if the configuration is absent.
   */
  useEffect(() => {
    publishCssVariables({ ...defaultColors, ...(themeColor || {}) });
  }, [themeColor]);
  const logo = getConfiguredLogo(appState.config);
  const disableTextLogo = appState?.config?.["fe-core"]?.logo?.disableTextLogo || false;

  /*
   * The emblem, from the most specific source that has one.
   *
   *   1. uploaded through the interface (the avatar sidecar, /avatars/branding)
   *   2. fe-core.logo.value in the module configuration, set in Django admin
   *   3. the emblem bundled into this build
   *
   * (2) already existed but has no form behind it: ModuleConfiguration is
   * exposed as a GraphQL query with no mutation, so a screen in openIMIS would
   * mean forking the backend. (1) is a file an administrator uploads, which is
   * why it wins.
   *
   * The probe is a HEAD, so nothing is downloaded when no logo has been set --
   * which is the usual case, and it happens on the sign-in page before anyone
   * has authenticated.
   */
  const [uploadedLogo, setUploadedLogo] = React.useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(BRANDING_LOGO, { method: "HEAD" })
      .then((r) => {
        if (!cancelled && r.ok) setUploadedLogo(BRANDING_LOGO);
      })
      // Absent sidecar, offline, 404: all mean "no uploaded logo", and none of
      // them should keep the page from rendering.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const emblem = uploadedLogo || logo;

  /*
   * Published to CSS as well as passed to the App, because the emblem appears
   * twice in places React does not render: the sidebar header and the sign-in
   * watermark, both drawn by src/index.css. Without this an administrator would
   * change one of the three and leave the other two, and only a rebuild would
   * bring them into line.
   */
  useEffect(() => {
    // Quoted: a data URI contains commas and semicolons, which are separators
    // inside url() when unquoted. It cannot contain a double quote itself.
    document.documentElement.style.setProperty("--lao-emblem", `url("${emblem}")`);
  }, [emblem]);

  if (appState.isLoading) {
    return (
      <MuiThemeProvider theme={dynamicTheme}>
        <LinearProgress className="bootstrap" />
      </MuiThemeProvider>
    );
  } else if (appState.error) {
    return (
      <FatalError
        error={{
          code: appState.error.status,
          message: appState.error.statusText,
        }}
      />
    );
  } else {
    const modulesManager = new ModulesManager(appState.config);
    const reducers = modulesManager.getContribs("reducers").reduce((reds, red) => {
      reds[red.key] = red.reducer;
      return reds;
    }, []);

    const middlewares = modulesManager.getContribs("middlewares");
    
    return (
      <MuiThemeProvider theme={dynamicTheme}>
        <Provider store={store(reducers, middlewares)}>
          <MuiPickersUtilsProvider utils={MomentUtils}>
            <ModulesManagerProvider modulesManager={modulesManager}>
              <App
                basename={process.env.PUBLIC_URL}
                localesManager={localesManager}
                messages={messages_ref}
                logo={emblem}
                disableTextLogo={disableTextLogo}
              />
            </ModulesManagerProvider>
          </MuiPickersUtilsProvider>
        </Provider>
      </MuiThemeProvider>
    );
  }
};

ReactDOM.render(
  <Sentry.ErrorBoundary
    fallback={<FatalError error={{ code: 500, message: "An unexpected error occurred" }} />}
    showDialog
  >
    <AppContainer />
  </Sentry.ErrorBoundary>,
  document.getElementById("root")
);

serviceWorker.register();
