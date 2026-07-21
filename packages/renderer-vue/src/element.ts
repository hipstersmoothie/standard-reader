import type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import { defineComponent } from "vue";
import type { PropType } from "vue";

import { renderDocument } from "./render";
import type { VueComponentsInput } from "./types";

/**
 * `<StandardDocument>` — a Vue component that renders a Standard Site document.
 *
 * ```vue
 * <StandardDocument :document="doc" :options="{ dropCap: true }" :components="components" />
 * ```
 */
export const StandardDocument = defineComponent({
  name: "StandardDocument",
  props: {
    document: {
      type: Object as PropType<StandardSiteDocument>,
      required: true,
    },
    options: {
      type: Object as PropType<RendererOptions>,
      default: undefined,
    },
    components: {
      type: Object as PropType<VueComponentsInput>,
      default: undefined,
    },
  },
  setup(props) {
    return () =>
      renderDocument(props.document, {
        components: props.components,
        options: props.options,
      });
  },
});
