'use strict';

const { St, Shell, GLib, Meta } = imports.gi;
const Main = imports.ui.main;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { PaintSignals } = Me.imports.effects.paint_signals;
const ColorEffect = Me.imports.effects.color_effect.ColorEffect;
const NoiseEffect = Me.imports.effects.noise_effect.NoiseEffect;
const BlurEffect = Me.imports.effects.blur_effect.BlurEffect;

const DASH_STYLES = [
    "transparent-dash",
    "light-dash",
    "dark-dash"
];

/// This type of object is created for every dash found, and talks to the main
/// DashBlur thanks to signals.
///
/// This allows to dynamically track the created dashes for each screen.
class DashInfos {
    constructor(dash_blur, dash, dash_container, dash_background, background, background_parent, effect, monitor) {
        // the parent DashBlur object, to communicate
        this.dash_blur = dash_blur;
        this.dash_container = dash_container;
        // the blurred dash
        this.dash = dash;
        this.dash_background = dash_background;
        this.background = background;
        this.background_parent = background_parent;
        this.background_effect = null;
        this.effect = effect;
        this.prefs = dash_blur.prefs;
        this.old_style = this.dash._background.style;
        this.old_opacity = this.background.get_opacity();
        this.monitor = monitor

        dash_blur.connections.connect(dash_blur, 'update-sigma', () => {
            this.effect.radius = this.dash_blur.sigma * 2;
        });

        dash_blur.connections.connect(dash_blur, 'update-corner', () => {
            this.effect.corner_radius = this.dash_blur.corner_radius;
        });

        dash_blur.connections.connect(dash_blur, 'update-wallpaper', () => {
            let bg = Main.layoutManager._backgroundGroup.get_child_at_index(this.monitor.index);
            this.background.set_content(bg.get_content());
            this.effect.set_enabled(true);
        });

        dash_blur.connections.connect(dash_blur, 'update-brightness', () => {
            this.effect.brightness = this.dash_blur.brightness;
        });

        dash_blur.connections.connect(dash_blur, 'override-background', () => {
            this.old_style = this.dash._background.style;
            this.dash._background.style = null;
            this.old_opacity = this.dash._background.get_opacity();
            this.dash._background.set_opacity(0);
            // if (!this.background_effect) {
            //     let color_str = this.old_style.split(';').find(
            //         kv_str => { return kv_str.includes('background-color') }
            //     ).slice('background-color:rgba'.length).trim();
            //     let color = color_str.slice(1, color_str.length - 1).split(',')
            //     this._log(`override-background / color: ${color}`);

            //     this.background_effect = new ColorEffect({
            //         red: Number(color[0].trim()) / 255,
            //         green: Number(color[1].trim()) / 255,
            //         blue: Number(color[2].trim()) / 255,
            //         blend: 1 - Number(color[3].trim())
            //     });
            // }
            // this.background.add_effect(this.background_effect);

            DASH_STYLES.forEach(
                style => this.dash.remove_style_class_name(style)
            );

            // this.dash.set_style_class_n(me(
            //     DASH_STYLES[this.prefs.dash_to_dock.STYLE_DASH_TO_DOCK]
            // );
        });

        dash_blur.connections.connect(dash_blur, 'reset-background', () => {
            this._log(`reset-background / opacity: ${this.old_opacity}`);
            this.dash._background.style = this.old_style;
            this.dash._background.set_opacity(this.old_opacity);
            if (this.background_effect) {
                this.background.remove_effect(this.background_effect);
            }

            DASH_STYLES.forEach(
                style => this.dash.remove_style_class_name(style)
            );
        });

        dash_blur.connections.connect(dash_blur, 'update-resize', () => {
            this.background.width = this.dash_background.width;
            this.background.height = this.dash_background.height;
            this.background.x = this.dash_background.x + this.dash.x;
            this.background.y = this.dash_background.y + this.dash.y;
        });

        dash_blur.connections.connect(dash_blur, 'show', () => {
            this.background_parent.show();
            // this.effect.sigma = this.dash_blur.sigma;
            // this.effect.brightness = this.dash_blur.brightness;
        });

        dash_blur.connections.connect(dash_blur, 'hide', () => {
            this.background_parent.hide();
            // this.effect.sigma = 0;
            // this.effect.brightness = 1
        });
    }



    _log(str) {
        if (this.prefs.DEBUG)
            log(`[Blur my Shell > dash]         ${str}`);
    }
}

var DashBlur = class DashBlur {
    constructor(connections, prefs) {
        this.dashes = [];
        this.connections = connections;
        this.prefs = prefs;
        this.paint_signals = new PaintSignals(connections);
        this.sigma = this.prefs.dash_to_dock.CUSTOMIZE
            ? this.prefs.dash_to_dock.SIGMA
            : this.prefs.SIGMA;
        this.brightness = this.prefs.dash_to_dock.CUSTOMIZE
            ? this.prefs.dash_to_dock.BRIGHTNESS
            : this.prefs.BRIGHTNESS;
        this.is_static = this.prefs.dash_to_dock.STATIC_BLUR;
        this.corner_radius = this.prefs.dash_to_dock.CORNER_RADIUS;
        //this.corner_radius = 18;
        this.enabled = false;
    }

    enable() {
        this.connections.connect(Main.uiGroup, 'actor-added', (_, actor) => {
            if (
                (actor.get_name() === "dashtodockContainer") &&
                (actor.constructor.name === 'DashToDock')
            )
                this.try_blur(actor);
        });

        this.blur_existing_dashes();
        this.connect_to_overview();

        this.enabled = true;
    }

    // Finds all existing dashes on every monitor, and call `try_blur` on them
    // We cannot only blur `Main.overview.dash`, as there could be several
    blur_existing_dashes() {
        this._log("searching for dash");

        // blur every dash found, filtered by name
        Main.uiGroup.get_children().filter((child) => {
            return (child.get_name() === "dashtodockContainer") &&
                (child.constructor.name === 'DashToDock');
        }).forEach(this.try_blur.bind(this));
    }

    // Tries to blur the dash contained in the given actor
    try_blur(dash_container) {
        let dash_box = dash_container._slider.get_child();

        // verify that we did not already blur that dash
        if (!dash_box.get_children().some((child) => {
            return child.get_name() === "dash-blurred-background-parent";
        })) {
            this._log("dash to dock found, blurring it");

            // finally blur the dash
            let dash = dash_box.get_children().find(child => {
                return child.get_name() === 'dash';
            });

            this.blur_dash_from(dash, dash_container);
        }
    }

    // Blurs the dash and returns a `DashInfos` containing its information
    blur_dash_from(dash, dash_container) {
        // dash vars
        let dash_background = dash.get_children().find(child => {
            return child.get_style_class_name() === 'dash-background';
        });
        let monitor = this.find_monitor_for(dash);
        let corner_radius = this.prefs.dash_to_dock.CORNER_RADIUS * monitor.geometry_scale;
        //this._log(`corner_radius(with scale): ${corner_radius}`);
        corner_radius = Math.min(corner_radius, dash_background.width / 2, dash_background.height / 2);
        // dash background parent, not visible
        let background_parent = new St.Widget({
            name: 'dash-blurred-background-parent',
            style_class: 'dash-blurred-background-parent',
            x: 0,
            y: 0,
            width: 0,
            height: 0
        });
        let blur_effect;
        let background;

        let is_static = this.prefs.dash_to_dock.STATIC_BLUR;
        this.is_static = is_static;
        this._log(`is_static: ${is_static}`);
        if (is_static) {

            background = new Meta.BackgroundActor({
                name: 'dash-blurred-background',
                meta_display: global.display,
                monitor: monitor.index
            });
            blur_effect= new BlurEffect({
                radius: 2 * this.sigma,
                brightness: this.brightness,
                width: dash_background.width,
                height: dash_background.height,
                corner_radius: corner_radius,
                direction: 0
            });
        } else {
            // dash background widget
            background = new St.Widget({
                name: 'dash-blurred-background',
                style_class: 'dash-blurred-background',
                x: dash.x + dash_background.x,
                y: dash.y + dash_background.y,
                width: dash_background.width,
                height: dash_background.height,
            });

            //the effect to be applied
            blur_effect = new Shell.BlurEffect({
                brightness: this.brightness,
                sigma: this.sigma,
                mode: Shell.BlurMode.BACKGROUND
            });
            // blur_effect= new BlurEffect({
            //     radius: 2 * this.sigma,
            //     brightness: this.brightness,
            //     width: dash_background.width,
            //     height: dash_background.height,
            //     corner_radius: corner_radius,
            //     direction: 1
            // });
            // HACK
            //
            //`Shell.BlurEffect` does not repaint when shadows are under it. [1]
            //
            // This does not entirely fix this bug (shadows caused by windows
            // still cause artifacts), but it prevents the shadows of the panel
            // buttons to cause artifacts on the panel itself
            //
            // [1]: https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/2857

            if (this.prefs.HACKS_LEVEL === 1) {
                this._log("dash hack level 1");
                this.paint_signals.disconnect_all();

                let rp = () => {
                    blur_effect.queue_repaint();
                };

                dash._box.get_children().forEach((icon) => {
                    try {
                        let zone = icon.get_child_at_index(0);

                        this.connections.connect(zone, [
                            'enter-event', 'leave-event', 'button-press-event'
                        ], rp);
                    } catch (e) {
                        this._log(`${e}, continuing`);
                    }
                });

                this.connections.connect(dash._box, 'actor-added', (_, actor) => {
                    try {
                        let zone = actor.get_child_at_index(0);

                        this.connections.connect(zone, [
                            'enter-event', 'leave-event', 'button-press-event'
                        ], rp);
                    } catch (e) {
                        this._log(`${e}, continuing`);
                    }
                });

                let show_apps = dash._showAppsIcon;

                this.connections.connect(show_apps, [
                    'enter-event', 'leave-event', 'button-press-event'
                ], rp);

                this.connections.connect(dash, 'leave-event', rp);
            } else if (this.prefs.HACKS_LEVEL === 2) {
                this._log("dash hack level 2");

                this.paint_signals.connect(background, blur_effect);
            } else {
                this.paint_signals.disconnect_all();
            }
        }

        // let color_effect = new ColorEffect({ color : this.prefs.COLOR });
        // color_effect._static = is_static;
        // color_effect.update_enabled();

        // add the widget to the dash
        background.add_effect(blur_effect);
        //background.add_effect(color_effect);
        background_parent.add_child(background);
        dash.get_parent().insert_child_at_index(background_parent, 0);

        // create infos
        let infos = new DashInfos(
            this,
            dash,
            dash_container,
            dash_background,
            background,
            background_parent,
            blur_effect,
            monitor
        );
        this.dashes.push(infos);

        // updates size and position on change
        let update_xy = () => {
            if (is_static) {
                let [dashx, dashy] = dash.get_parent().get_transformed_position();
                background.x = -dashx;
                background.y = -dashy;
            } else {
                background.x = dash.x + dash_background.x;
                background.y = dash.y + dash_background.y;
            }
        }
        let update_bac = () => {
            let [x, y] = dash_background.get_transformed_position();
            background.set_clip(x, y, dash_background.width, dash_background.height);
            this.corner_radius = this.prefs.dash_to_dock.CORNER_RADIUS;
            this.emit("update-corner", true);
        }
        let update_width = () => {
            background.width = dash_background.width;
            if (is_static) {
                blur_effect.width = dash_background.width;
                update_bac();
            }
        }
        let update_height = () => {
            background.height = dash_background.height;
            if (is_static) {
                blur_effect.height = dash_background.height;
                update_bac();
            }
        }
        this.connections.connect(dash_container, 'notify::width', _ => {
            update_xy();
            update_width();
        });
        this.connections.connect(dash_container, 'notify::height', _ => {
            update_xy();
            update_height();
        });
        this.connections.connect(dash, 'notify::width', _ => {
            update_xy();
            update_width();
        });
        this.connections.connect(dash, 'notify::height', _ => {
            update_xy();
            update_height();
        });

        // update the background
        if (is_static) {
            this.update_wallpaper();
            update_xy();
            update_bac();
        }
        this.update_background();

        // returns infos
        return infos;
    }

    update_wallpaper() {
        this.emit('update-wallpaper', true);
    }

    /// Connect when overview if opened/closed to hide/show the blur accordingly
    connect_to_overview() {
        this.connections.disconnect_all_for(Main.overview);

        if (this.prefs.dash_to_dock.UNBLUR_IN_OVERVIEW) {
            this.connections.connect(
                Main.overview, 'showing', this.hide.bind(this)
            );
            this.connections.connect(
                Main.overview, 'hidden', this.show.bind(this)
            );
        }
    };

    /// Updates the background to either remove it or not, according to the
    /// user preferences.
    update_background() {
        if (this.prefs.dash_to_dock.OVERRIDE_BACKGROUND)
            this.emit('override-background', true);
        else
            this.emit('reset-background', true);
    }

    update_size() {
        this.emit('update-resize', true);
    }

    set_sigma(sigma) {
        this.sigma = sigma;
        this.emit('update-sigma', true);
    }

    set_brightness(brightness) {
        this.brightness = brightness;
        this.emit('update-brightness', true);
    }

    // not implemented for dynamic blur
    set_color(c) { }
    set_noise_amount(n) { }
    set_noise_lightness(l) { }

    /// An helper function to find the monitor in which an actor is situated,
    /// there might be a pre-existing function in GLib already
    find_monitor_for(actor) {
        let extents = actor.get_transformed_extents();
        let rect = new Meta.Rectangle({
            x: extents.get_x(),
            y: extents.get_y(),
            width: extents.get_width(),
            height: extents.get_height(),
        });

        let index = global.display.get_monitor_index_for_rect(rect);

        return Main.layoutManager.monitors[index];
    }

    disable() {
        this._log("removing blur from dashes");

        this.dashes.forEach(dash_info => {
            this._log(`removing blur from dash in monitor ${dash_info.monitor}`);
            if (dash_info.dash.get_parent()) {
                this.emit('reset-background', true);
                dash_info.dash.get_parent().remove_child(dash_info.background_parent);

                DASH_STYLES.forEach(
                    style => dash_info.dash.remove_style_class_name(style)
                );
            }
        });

        this.dashes = [];
        this.connections.disconnect_all();

        this.enabled = false;
    }

    show() {
        this.emit('show', true);
    }
    hide() {
        this.emit('hide', true);
    }

    _log(str) {
        if (this.prefs.DEBUG)
            log(`[Blur my Shell > dash manager] ${str}`);
    }
};

Signals.addSignalMethods(DashBlur.prototype);
