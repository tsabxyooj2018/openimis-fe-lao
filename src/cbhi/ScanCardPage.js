import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useModulesManager } from "@openimis/fe-core";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Divider,
  Paper,
  TextField,
  Typography,
} from "@material-ui/core";
import { useHistory } from "react-router-dom";
import Alert from "@material-ui/lab/Alert";
import CameraAltIcon from "@material-ui/icons/CameraAlt";
import PhotoLibraryIcon from "@material-ui/icons/PhotoLibrary";
import CropFreeIcon from "@material-ui/icons/CropFree";
import { fetchInsureesForScan, photoUrl, locationLine } from "./api";
import { hasCamera, isSecure, listenForScanner, readFromVideo, readFromFile } from "./scanCard";

/*
 * Find a member by their membership card.
 *
 * The card this deployment prints carries the insurance number as a Code 128
 * barcode. This turns that back into a member, by whichever route the counter
 * actually has:
 *
 *   a handheld scanner   works with no permission and on any browser
 *   the device camera    Chromium only, and only over https
 *   a photograph         same decoder, for a card sent by message
 *   typing               always, because every one of the above can fail
 *
 * WHY NOT JUST THE TOOLBAR ENQUIRY
 *
 * openIMIS already has one: fe-insuree's enquiry box takes an insurance number
 * and opens the member on Enter, so a handheld scanner aimed at it works today.
 * What it cannot do is be aimed at. The clerk has to click it first, and a
 * scanner fired at an unfocused page types into nothing.
 *
 * So the scanner listener here is global -- scan anywhere on this page and it
 * resolves -- and the camera and photograph paths exist at all, which the
 * enquiry has no way to offer.
 */

/*
 * The member's photograph, or their initials.
 *
 * openIMIS holds a photo either inline as base64 or as a file under the photos
 * volume, and an insuree record says WHICH but never whether the file is
 * actually there. It can name a file that was never uploaded, was lost in a
 * migration, or sits behind a /photos/ path the web server was never told to
 * serve -- and none of that is knowable until the request is made.
 *
 * Without onError the browser draws its broken-image icon, which in a list of
 * search results looks like the page is broken rather than like one member
 * having no picture on file. The card renderer has always handled this; this
 * list did not, which is the whole of what was visibly wrong.
 *
 * Initials rather than an empty circle, because the point of a picture in a
 * result list is telling two similar rows apart, and initials still do some of
 * that work.
 */
const Avatar = ({ insuree }) => {
  const src = photoUrl(insuree.photo);
  const [failed, setFailed] = useState(false);

  const initials = [insuree.otherNames, insuree.lastName]
    .filter(Boolean)
    .map((part) => String(part).trim()[0])
    .join("")
    .toUpperCase();

  const frame = {
    width: 64,
    height: 64,
    borderRadius: "50%",
    objectFit: "cover",
    flex: "none",
  };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        style={frame}
        onError={() => {
          /*
           * Said out loud with the URL, because a missing picture is otherwise
           * indistinguishable from a member who never had one -- and the two
           * need completely different fixes. A /photos/ path here means the
           * file or the route is missing on the server, and the SAME picture
           * will be missing on openIMIS's own insuree page, since this builds
           * the URL exactly as fe-insuree does.
           */
          // eslint-disable-next-line no-console
          console.warn(`[cbhi] photograph did not load: ${src}`);
          setFailed(true);
        }}
      />
    );
  }

  return (
    <Box
      style={{
        ...frame,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e3ecf1",
        color: "#5f7d95",
        fontSize: 20,
      }}
    >
      {initials || "—"}
    </Box>
  );
};

const ScanCardPage = () => {
  const intl = useIntl();
  const history = useHistory();
  const modulesManager = useModulesManager();

  /*
   * The deployment's own insurance-number length, not a constant. It decides
   * when a typed value is a COMPLETE number and can be looked up exactly rather
   * than as a prefix -- which is the path every scanned barcode takes, since a
   * barcode always carries the whole number.
   *
   * Read from fe-insuree's own key so a deployment that changes its numbering
   * changes one setting and both this page and the rest of the application
   * follow.
   */
  const chfIdMaxLength = modulesManager.getConf("fe-insuree", "insureeForm.chfIdMaxLength", 12);
  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const fileRef = useRef(null);

  const [camera, setCamera] = useState(false);
  const [term, setTerm] = useState("");
  const [state, setState] = useState({ busy: false, error: null, ran: false });
  const [results, setResults] = useState([]);

  /** Look a number up and show whoever holds it. */
  const lookup = useCallback(
    async (value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return;
      setTerm(trimmed);
      setState({ busy: true, error: null, ran: false });
      try {
        const found = await fetchInsureesForScan(trimmed, chfIdMaxLength);
        setResults(found);
        setState({ busy: false, error: null, ran: true });
      } catch (error) {
        setResults([]);
        setState({ busy: false, error: String(error?.message ?? ""), ran: true });
      }
    },
    [chfIdMaxLength],
  );

  /*
   * The handheld scanner, listening for as long as this page is open. Detached
   * on unmount so it cannot go on intercepting keystrokes on other screens.
   */
  useEffect(() => listenForScanner(lookup), [lookup]);

  const stopCamera = useCallback(() => {
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    if (streamRef.current) {
      // Every track, or the camera light stays on after the page is left.
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCamera(false);
  }, []);

  // Whatever ends this page -- navigation, a reload, closing the tab.
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    setState((s) => ({ ...s, error: null }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera on a phone; ignored on a laptop, which has one.
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      /*
       * Four frames a second. Every frame would busy the main thread for a
       * barcode that is either in view for a second or not there at all, and
       * this runs on whatever hardware the office has.
       */
      loopRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        const value = readFromVideo(videoRef.current);
        if (value) {
          stopCamera();
          lookup(value);
        }
      }, 250);
    } catch (error) {
      stopCamera();
      setState((s) => ({
        ...s,
        error: t("scan.cameraDenied", "The camera could not be opened. Permission may have been refused."),
      }));
    }
  }, [lookup, stopCamera, t]);

  const onFile = useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      // Cleared straight away so the same photograph can be tried twice.
      event.target.value = "";
      if (!file) return;
      setState((s) => ({ ...s, error: null }));
      try {
        const value = await readFromFile(file);
        if (value) lookup(value);
        else {
          setState({
            busy: false,
            ran: true,
            error: t("scan.noBarcode", "No barcode could be read in that image."),
          });
          setResults([]);
        }
      } catch (error) {
        setState({ busy: false, ran: true, error: String(error?.message ?? "") });
      }
    },
    [lookup, t],
  );

  return (
    <Box p={2}>
      <Paper>
        <Box p={2} display="flex" alignItems="center">
          <CropFreeIcon style={{ marginRight: 8 }} />
          <Typography variant="h6">{t("scan.title", "Find a member by card")}</Typography>
        </Box>
        <Divider />

        <Box p={2} display="flex" flexWrap="wrap" alignItems="center" style={{ gap: 16 }}>
          <TextField
            label={t("scan.number", "Insurance number")}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") lookup(term);
            }}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" color="primary" onClick={() => lookup(term)} disabled={state.busy}>
            {state.busy ? <CircularProgress size={20} /> : t("scan.find", "Find")}
          </Button>

          <>
              <Button
                startIcon={<CameraAltIcon />}
                onClick={camera ? stopCamera : startCamera}
                disabled={!isSecure() || !hasCamera()}
              >
                {camera ? t("scan.stopCamera", "Stop camera") : t("scan.useCamera", "Use camera")}
              </Button>
              <Button startIcon={<PhotoLibraryIcon />} onClick={() => fileRef.current && fileRef.current.click()}>
                {t("scan.uploadPhoto", "Upload a photo")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                style={{ display: "none" }}
              />
          </>
        </Box>

        <Box px={2} pb={2}>
          <Typography variant="caption" color="textSecondary">
            {t(
              "scan.scannerHint",
              "A handheld scanner works on this page without clicking anything — just scan.",
            )}
          </Typography>
        </Box>

        {!isSecure() ? (
          <Box px={2} pb={2}>
            <Alert severity="warning">
              {t("scan.insecure", "The camera needs a secure (https) connection.")}
            </Alert>
          </Box>
        ) : null}
      </Paper>

      {camera ? (
        <Box mt={2}>
          <Paper>
            <Box p={2} display="flex" flexDirection="column" alignItems="center" style={{ gap: 8 }}>
              {/* muted and playsInline, or iOS refuses to play it inline. */}
              <video
                ref={videoRef}
                muted
                playsInline
                style={{ width: "100%", maxWidth: 480, borderRadius: 6, background: "#000" }}
              />
              <Typography variant="caption" color="textSecondary">
                {t("scan.aim", "Hold the barcode inside the frame.")}
              </Typography>
            </Box>
          </Paper>
        </Box>
      ) : null}

      {state.error ? (
        <Box mt={2}>
          <Alert severity="error">{state.error}</Alert>
        </Box>
      ) : null}

      {state.ran && !state.error && !results.length ? (
        <Box mt={2}>
          <Alert severity="info">
            {t("scan.notFound", "No member holds that number.")}
          </Alert>
        </Box>
      ) : null}

      {results.length ? (
        <Box mt={2}>
          <Paper>
            <Box p={2} display="flex" flexDirection="column" style={{ gap: 12 }}>
              {results.map((insuree) => (
                /*
                 * The whole result opens the member's own record.
                 *
                 * Everything a clerk needs after finding somebody -- their
                 * family, policies, contributions, photograph, history -- is
                 * already on openIMIS's insuree page. Rebuilding a smaller
                 * version of it here would be a second thing to keep in step
                 * with a screen that already exists and is already right.
                 *
                 * The route takes the family uuid as well, which is why the
                 * projection carries it: fe-insuree passes both when it
                 * navigates from its own list, and the family panel on that
                 * page fills in without a second lookup.
                 */
                <ButtonBase
                  key={insuree.uuid}
                  onClick={() =>
                    history.push(
                      `/insuree/insurees/insuree/${insuree.uuid}` +
                        (insuree.family?.uuid ? `/${insuree.family.uuid}` : ""),
                    )
                  }
                  style={{ display: "block", width: "100%", textAlign: "left", borderRadius: 6 }}
                >
                  <Box display="flex" alignItems="center" style={{ gap: 16, width: "100%" }}>
                    <Avatar insuree={insuree} />
                    <Box minWidth={0}>
                      <Typography variant="subtitle1">
                        {[insuree.otherNames, insuree.lastName].filter(Boolean).join(" ")}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {insuree.chfId}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" display="block">
                        {locationLine(insuree)}
                      </Typography>
                      <Typography variant="caption" color="primary" display="block">
                        {t("scan.openRecord", "Open the full record")}
                      </Typography>
                    </Box>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
          </Paper>
        </Box>
      ) : null}
    </Box>
  );
};

export default ScanCardPage;
